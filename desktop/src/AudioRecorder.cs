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

    public bool IsRecording => _waveIn is not null;

    public void Start()
    {
        if (IsRecording)
            return;
        _path = Path.Combine(Path.GetTempPath(), $"hamnegar_{Guid.NewGuid():N}.wav");
        _waveIn = new WaveIn { WaveFormat = new WaveFormat(16000, 16, 1) };
        _writer = new WaveFileWriter(_path, _waveIn.WaveFormat);
        _waveIn.DataAvailable += (_, e) => _writer?.Write(e.Buffer, 0, e.BytesRecorded);
        _waveIn.RecordingStopped += (_, _) => { };
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
        }
        return path;
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
