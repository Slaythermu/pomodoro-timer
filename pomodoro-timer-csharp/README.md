# Pomodoro Timer (C# / WPF)

Versão nativa para Windows do [Pomodoro Timer](../README.md), portada de HTML/CSS/JS para C# com WPF (.NET 8). Mesmas funcionalidades e visual da versão web, rodando como um `.exe` de janela, sem navegador.

## Funcionalidades

- Três modos: **Foco** (25 min), **Pausa curta** (5 min) e **Pausa longa** (15 min)
- Anel de progresso animado (desenhado com `PathGeometry`/`ArcSegment`, equivalente ao `stroke-dashoffset` do SVG original)
- Bipe de notificação ao concluir uma sessão (`Console.Beep`, 880 Hz — mesma frequência da versão web)
- Histórico das últimas sessões, persistido em `%AppData%\PomodoroTimer\history.json`
- Estatísticas do dia: número de sessões e minutos focados

## Como rodar

Requer o [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

```bash
cd pomodoro-timer-csharp
dotnet run --project PomodoroTimer
```

## Como gerar um executável standalone

```bash
dotnet publish PomodoroTimer -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

O `.exe` gerado fica em `PomodoroTimer/bin/Release/net8.0-windows/win-x64/publish/` e roda em qualquer Windows sem precisar instalar o .NET.

## Estrutura do projeto

```
pomodoro-timer-csharp/
└── PomodoroTimer/
    ├── App.xaml           # Tema (cores, estilos dos botões)
    ├── MainWindow.xaml    # Layout da janela
    ├── MainWindow.xaml.cs # Lógica do timer, anel de progresso e histórico
    └── PomodoroTimer.csproj
```
