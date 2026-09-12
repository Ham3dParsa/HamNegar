using System.Configuration;
using System.Data;
using System.Windows;

namespace HamNegar.Native;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // Apply the persisted theme before any window resolves its resources.
        ThemeManager.ApplyTheme(ThemeManager.LoadTheme());
    }
}

