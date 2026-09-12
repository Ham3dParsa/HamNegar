using System;
using System.IO;
using NAudio.Wave;

namespace HamNegar.Native;

// NAudio WaveInEvent @ 16000Hz / 16-bit / mono → temp .wav in %TEMP%.
// Caller owns start/stop ordering; Stop returns the wav path (file closed).
public sealed class AudioRecorder : IDisposable
{
    private WaveIn? _waveIn;
    private WaveFileWriter? _writer;
    private string? _path;
    private bool _disposed;
    private volatile float _level;

    public bool IsRecording => _waveIn is not null;

    // Live input peak of the most recent buffer, 0..1. Read-only telemetry
    // for UI animation only — recording path (writer/format) untouched.
    // DataAvailable fires on a background thread; volatile float read is safe.
    // 0 when idle/stopped; silence decays to 0 naturally (quiet buffers).
    public float Level => _level;

    public void Start()
    {
        if (IsRecording)
            return;
        _path = Path.Combine(Path.GetTempPath(), $"hamnegar_{Guid.NewGuid():N}.wav");
        _waveIn = new WaveIn { WaveFormat = new WaveFormat(16000, 16, 1) };
        _writer = new WaveFileWriter(_path, _waveIn.WaveFormat);
        _waveIn.DataAvailable += (_, e) =>
        {
            _writer?.Write(e.Buffer, 0, e.BytesRecorded);
            _level = PeakOf(e.Buffer, e.BytesRecorded);
        };
        _waveIn.RecordingStopped += (_, _) => { };
        _level = 0;
        _waveIn.StartRecording();
    }

    public string Stop()
    {
        var path = _path ?? throw new InvalidOperationException("Not recording.");
        try
        {
            _waveIn?.StopRecording();
        }
        finally
        {
            _waveIn?.Dispose();
            _waveIn = null;
            _writer?.Dispose();
            _writer = null;
            _path = null;
            _level = 0;
        }
        return path;
    }

    // Peak amplitude of a 16-bit mono buffer, normalized 0..1.
    private static float PeakOf(byte[] buffer, int bytesRecorded)
    {
        int samples = bytesRecorded / 2;
        if (samples <= 0)
            return 0;
        int peak = 0;
        for (int i = 0; i < samples; i++)
        {
            short s = (short)(buffer[i * 2] | (buffer[i * 2 + 1] << 8));
            int a = s < 0 ? -s : s;
            if (a > peak)
                peak = a;
        }
        return peak / 32768f;
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        try
        {
            if (IsRecording)
                Stop();
        }
        catch
        {
            _waveIn?.Dispose();
            _waveIn = null;
            _writer?.Dispose();
            _writer = null;
        }
    }
}
