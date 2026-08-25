using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace PomodoroTimer;

public class SessionEntry
{
    public string Type { get; set; } = "";
    public int Minutes { get; set; }
    public string Date { get; set; } = "";
    public DateTime CompletedAt { get; set; }
}

public class HistoryItem
{
    public string TypeLabel { get; set; } = "";
    public string SummaryText { get; set; } = "";
}

public partial class MainWindow : Window
{
    private static readonly Dictionary<string, int> Durations = new()
    {
        ["focus"] = 25 * 60,
        ["short"] = 5 * 60,
        ["long"] = 15 * 60,
    };

    private static readonly Dictionary<string, string> Labels = new()
    {
        ["focus"] = "Foco",
        ["short"] = "Pausa curta",
        ["long"] = "Pausa longa",
    };

    private readonly string _historyPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "PomodoroTimer", "history.json");

    private readonly DispatcherTimer _timer;
    private readonly ObservableCollection<HistoryItem> _historyItems = new();

    private string _mode = "focus";
    private int _secondsLeft = Durations["focus"];
    private bool _running;

    public MainWindow()
    {
        InitializeComponent();
        HistoryItemsControl.ItemsSource = _historyItems;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timer.Tick += Timer_Tick;

        SetMode("focus", resetTimer: false);
        UpdateDisplay();
        RenderStats();
        RenderHistory();
    }

    private Brush AccentBrush(string mode) => mode switch
    {
        "short" => (Brush)FindResource("ShortBrush"),
        "long" => (Brush)FindResource("LongBrush"),
        _ => (Brush)FindResource("FocusBrush"),
    };

    private void SetMode(string newMode, bool resetTimer = true)
    {
        _mode = newMode;
        var accent = AccentBrush(newMode);
        RingProgressPath.Stroke = accent;
        StartPauseBtn.Background = accent;

        foreach (var btn in new[] { ModeFocusBtn, ModeShortBtn, ModeLongBtn })
        {
            bool active = (string)btn.Tag == newMode;
            btn.Background = active ? accent : Brushes.Transparent;
            btn.Foreground = active ? Brushes.White : (Brush)FindResource("MutedBrush");
        }

        if (resetTimer)
        {
            PauseTimer();
            _secondsLeft = Durations[newMode];
            UpdateDisplay();
        }
    }

    private void ModeButton_Click(object sender, RoutedEventArgs e)
    {
        var tag = (string)((FrameworkElement)sender).Tag;
        SetMode(tag);
    }

    private string FormatTime(int seconds)
    {
        int m = seconds / 60;
        int s = seconds % 60;
        return $"{m:D2}:{s:D2}";
    }

    private void UpdateDisplay()
    {
        TimeDisplay.Text = FormatTime(_secondsLeft);
        int total = Durations[_mode];
        double fraction = total == 0 ? 0 : (double)_secondsLeft / total;
        UpdateRing(fraction);
    }

    private static Point PointOnCircle(double cx, double cy, double r, double angleDeg)
    {
        double rad = Math.PI / 180 * angleDeg;
        return new Point(cx + r * Math.Sin(rad), cy - r * Math.Cos(rad));
    }

    private void UpdateRing(double fraction)
    {
        fraction = Math.Max(0, Math.Min(1, fraction));
        const double cx = 110, cy = 110, r = 100;

        if (fraction <= 0.001)
        {
            RingProgressPath.Data = null;
            return;
        }

        if (fraction >= 0.999)
        {
            RingProgressPath.Data = new EllipseGeometry(new Point(cx, cy), r, r);
            return;
        }

        double angle = fraction * 360;
        var start = PointOnCircle(cx, cy, r, 0);
        var end = PointOnCircle(cx, cy, r, angle);
        bool isLargeArc = angle > 180;

        var figure = new PathFigure { StartPoint = start, IsClosed = false };
        figure.Segments.Add(new ArcSegment(end, new Size(r, r), 0, isLargeArc, SweepDirection.Clockwise, true));
        var geometry = new PathGeometry();
        geometry.Figures.Add(figure);
        RingProgressPath.Data = geometry;
    }

    private void PlayBeep()
    {
        Task.Run(() =>
        {
            try { Console.Beep(880, 500); } catch { /* som indisponível */ }
        });
    }

    private void Timer_Tick(object? sender, EventArgs e)
    {
        _secondsLeft -= 1;
        if (_secondsLeft <= 0)
        {
            CompleteSession();
            return;
        }
        UpdateDisplay();
    }

    private void CompleteSession()
    {
        PauseTimer();
        PlayBeep();
        int total = Durations[_mode];
        SaveEntry(new SessionEntry
        {
            Type = _mode,
            Minutes = (int)Math.Round(total / 60.0),
            Date = DateTime.Now.ToString("yyyy-MM-dd"),
            CompletedAt = DateTime.Now,
        });

        _secondsLeft = 0;
        UpdateDisplay();
        Title = "Pomodoro — concluído!";

        var resetTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        resetTimer.Tick += (_, _) =>
        {
            resetTimer.Stop();
            Title = "Pomodoro";
            _secondsLeft = Durations[_mode];
            UpdateDisplay();
        };
        resetTimer.Start();
    }

    private void StartTimer()
    {
        if (_running) return;
        _running = true;
        StartPauseBtn.Content = "Pausar";
        _timer.Start();
    }

    private void PauseTimer()
    {
        _running = false;
        StartPauseBtn.Content = "Iniciar";
        _timer.Stop();
    }

    private void StartPauseBtn_Click(object sender, RoutedEventArgs e)
    {
        if (_running) PauseTimer();
        else StartTimer();
    }

    private void ResetBtn_Click(object sender, RoutedEventArgs e)
    {
        PauseTimer();
        _secondsLeft = Durations[_mode];
        UpdateDisplay();
    }

    private List<SessionEntry> LoadHistory()
    {
        try
        {
            if (!File.Exists(_historyPath)) return new List<SessionEntry>();
            var json = File.ReadAllText(_historyPath);
            return JsonSerializer.Deserialize<List<SessionEntry>>(json) ?? new List<SessionEntry>();
        }
        catch
        {
            return new List<SessionEntry>();
        }
    }

    private void SaveEntry(SessionEntry entry)
    {
        var history = LoadHistory();
        history.Insert(0, entry);
        if (history.Count > 50) history = history.GetRange(0, 50);

        var dir = Path.GetDirectoryName(_historyPath)!;
        Directory.CreateDirectory(dir);
        File.WriteAllText(_historyPath, JsonSerializer.Serialize(history));

        RenderHistory();
        RenderStats();
    }

    private void RenderStats()
    {
        var history = LoadHistory();
        var today = DateTime.Now.ToString("yyyy-MM-dd");
        var todays = history.Where(h => h.Date == today && h.Type == "focus").ToList();
        SessionCountText.Text = todays.Count.ToString();
        MinutesFocusedText.Text = todays.Sum(h => h.Minutes).ToString();
    }

    private void RenderHistory()
    {
        var history = LoadHistory();
        _historyItems.Clear();

        if (history.Count == 0)
        {
            _historyItems.Add(new HistoryItem { TypeLabel = "Nenhuma sessão ainda", SummaryText = "" });
            return;
        }

        foreach (var h in history.Take(10))
        {
            _historyItems.Add(new HistoryItem
            {
                TypeLabel = Labels[h.Type],
                SummaryText = $"{h.Minutes} min · {h.CompletedAt:HH:mm}",
            });
        }
    }
}
