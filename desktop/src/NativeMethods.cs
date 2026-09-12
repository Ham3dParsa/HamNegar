using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using System.Threading;

namespace HamNegar.Native;

internal static class NativeMethods
{
    // Injection mode (pill.settings.json key "injectMode", additive):
    // "instant" (default, safe) | "animated" (chunked + focus guard).
    public enum InjectMode
    {
        Instant,
        Animated,
    }

    // Never-throw load: missing/corrupt file, missing key, or any other
    // value → Instant. Lengths/HWNDs only, never content; never logs keys.
    public static InjectMode LoadInjectMode()
    {
        try
        {
            string path = SettingsStore.SettingsPath;
            if (!File.Exists(path))
                return InjectMode.Instant;
            var root = JsonNode.Parse(File.ReadAllText(path))?.AsObject();
            string? raw = root?["injectMode"]?.GetValue<string>();
            return string.Equals(raw?.Trim(), "animated", StringComparison.OrdinalIgnoreCase)
                ? InjectMode.Animated
                : InjectMode.Instant;
        }
        catch
        {
            return InjectMode.Instant;
        }
    }

    public const int WM_HOTKEY = 0x0312;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT = 0x0004;
    public const uint VK_SPACE = 0x20;

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public nint dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public nint dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;
        [FieldOffset(0)]
        public KEYBDINPUT ki;
        [FieldOffset(0)]
        public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    // INSTANT (default, safe): ONE SendInput call for the whole text (cap
    // 4096 chars per call, loop only above that) — the whole text lands
    // before the user can click elsewhere, with no animated batch rendering.
    // Typing replaces any active selection natively in the focused control.
    // Never logs content; caller reports length only.
    // Returns the number of chars fully injected (KEYDOWN+KEYUP both accepted).
    // ROOT CAUSE (fixed): InputUnion used to contain ONLY KEYBDINPUT, so
    // Marshal.SizeOf<INPUT>() was 32 bytes on x64 while the native
    // sizeof(INPUT) is 40 (union must fit MOUSEINPUT). SendInput validates
    // cbSize and silently injected nothing (return 0, ignored). The union now
    // carries MOUSEINPUT/HARDWAREINPUT so cbSize matches the OS stride.
    public static int SendUnicodeText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return 0;
        int cbSize = Marshal.SizeOf<INPUT>();
        int charsSent = 0;
        const int chunkChars = 4096;
        for (int off = 0; off < text.Length; off += chunkChars)
        {
            int n = Math.Min(chunkChars, text.Length - off);
            var inputs = new INPUT[n * 2];
            for (int i = 0; i < n; i++)
            {
                char c = text[off + i];
                inputs[i * 2] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new InputUnion
                    {
                        ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = nint.Zero },
                    },
                };
                inputs[i * 2 + 1] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new InputUnion
                    {
                        ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = nint.Zero },
                    },
                };
            }
            uint accepted = SendInput((uint)inputs.Length, inputs, cbSize);
            charsSent += (int)(accepted / 2);
            if (accepted != (uint)inputs.Length)
                break;
        }
        return charsSent;
    }

    // ANIMATED (opt-in): chunked send (4 chars per chunk, ~40ms gap ≈ visible
    // typing) with a FOCUS GUARD — before each chunk re-check GetForegroundWindow() equals the
    // captured target HWND; on mismatch stop immediately and return the sent
    // count so the caller can toast (Lang.K.InjFocusMoved)
    // and keep the full text in history. Runs on the caller's thread (the gap
    // sleeps there); lengths/HWNDs only, never content.
    // Returns the number of chars fully injected before the stop.
    public static int SendUnicodeTextAnimated(string text, IntPtr targetHwnd, int chunkChars = 4, int gapMs = 40)
    {
        if (string.IsNullOrEmpty(text))
            return 0;
        if (targetHwnd == IntPtr.Zero || !IsWindow(targetHwnd))
            return 0;
        if (chunkChars <= 0)
            chunkChars = 30;
        if (gapMs < 0)
            gapMs = 0;
        int cbSize = Marshal.SizeOf<INPUT>();
        int charsSent = 0;
        for (int off = 0; off < text.Length; off += chunkChars)
        {
            IntPtr fg;
            try { fg = GetForegroundWindow(); }
            catch { break; }
            if (fg != targetHwnd)
                break; // FOCUS GUARD: user clicked elsewhere — stop, keep remainder.
            int n = Math.Min(chunkChars, text.Length - off);
            var inputs = new INPUT[n * 2];
            for (int i = 0; i < n; i++)
            {
                char c = text[off + i];
                inputs[i * 2] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new InputUnion
                    {
                        ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = nint.Zero },
                    },
                };
                inputs[i * 2 + 1] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new InputUnion
                    {
                        ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = nint.Zero },
                    },
                };
            }
            uint accepted = SendInput((uint)inputs.Length, inputs, cbSize);
            charsSent += (int)(accepted / 2);
            if (accepted != (uint)inputs.Length)
                break;
            if (charsSent < text.Length)
                Thread.Sleep(gapMs);
        }
        return charsSent;
    }

    // Restore a captured foreground HWND. SetForegroundWindow alone can fail
    // (foreground lock / UIPI integrity / minimized target), so fall back to a
    // temporary AttachThreadInput bridge before retrying. Lengths/HWNDs only.
    public static bool TryRestoreWindow(IntPtr hWnd)
    {
        const int SW_RESTORE = 9;
        if (hWnd == IntPtr.Zero || !IsWindow(hWnd))
            return false;
        try
        {
            if (IsIconic(hWnd))
                ShowWindow(hWnd, SW_RESTORE);
        }
        catch
        {
            // Best-effort un-minimize; fall through to foreground attempt.
        }
        if (SetForegroundWindow(hWnd))
            return true;
        try
        {
            IntPtr fg = GetForegroundWindow();
            uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, out _) : 0;
            uint targetThread = GetWindowThreadProcessId(hWnd, out _);
            uint curThread = GetCurrentThreadId();
            bool attachedFg = fgThread != 0 && fgThread != curThread && AttachThreadInput(curThread, fgThread, true);
            bool attachedTarget = targetThread != 0 && targetThread != curThread && AttachThreadInput(curThread, targetThread, true);
            try
            {
                if (SetForegroundWindow(hWnd))
                    return true;
            }
            finally
            {
                if (attachedTarget)
                    AttachThreadInput(curThread, targetThread, false);
                if (attachedFg)
                    AttachThreadInput(curThread, fgThread, false);
            }
            return SetForegroundWindow(hWnd);
        }
        catch
        {
            return false;
        }
    }
}
