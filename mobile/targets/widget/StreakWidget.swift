import SwiftUI
import WidgetKit

// Mercia's day-streak widget (small + medium), "Halo" look: a dark card with
// the day's state spilling down from the top edge as colored light.

let appGroup = "group.com.oasisai.app"

func loadSnapshot() -> Snapshot? {
  guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "streak"),
        let data = json.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(Snapshot.self, from: data)
}

struct StreakEntry: TimelineEntry {
  let date: Date
  let view: StreakView
}

struct Provider: TimelineProvider {
  // Shown in the widget gallery and while loading: a 3-day streak, afternoon.
  private var sample: StreakEntry {
    StreakEntry(date: Date(), view: StreakView(mood: .afternoon, streak: 3, line: "Don't forget", tone: .amber,
                                               week: [.active, .active, .active, .today, .future, .future, .future]))
  }

  func placeholder(in context: Context) -> StreakEntry { sample }

  func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
    if context.isPreview { return completion(sample) }
    completion(StreakEntry(date: Date(), view: streakState(loadSnapshot(), now: Date(), calendar: .current)))
  }

  // One entry now, then one at each moment the state can change (Afternoon
  // start, Night start, midnight); WidgetKit asks again after the last one.
  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
    let snap = loadSnapshot()
    let now = Date()
    let cal = Calendar.current
    let dates = [now] + nextRefreshDates(snap, now: now, calendar: cal)
    let entries = dates.map { StreakEntry(date: $0, view: streakState(snap, now: $0, calendar: cal)) }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

// MARK: - Look

extension Color {
  init(hex: UInt32, alpha: Double = 1) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
              blue: Double(hex & 0xFF) / 255, opacity: alpha)
  }
}

private let card = Color(hex: 0x141414)
private let green = Color(hex: 0x5DCAA5)

private func color(_ tone: Tone) -> Color {
  switch tone {
  case .green: return green
  case .calm: return Color(hex: 0xE8E8E8)
  case .amber: return Color(hex: 0xE8A13A)
  case .red: return Color(hex: 0xE5484D)
  }
}

/// Colored light from the top edge; faint white when there's no streak.
private func halo(_ v: StreakView, x: CGFloat, radius: CGFloat) -> some View {
  let quiet = v.mood == .start || v.mood == .signedOut
  let glow = quiet ? Color.white.opacity(0.14) : color(v.tone).opacity(0.69)
  return ZStack {
    card
    RadialGradient(colors: [glow, .clear], center: UnitPoint(x: x, y: -0.12), startRadius: 0, endRadius: radius)
  }
}

private struct Label: View {
  var body: some View {
    Text("DAY STREAK").font(.system(size: 10, weight: .semibold)).tracking(1.4).foregroundStyle(.white.opacity(0.55))
  }
}

private struct Status: View {
  let v: StreakView
  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(color(v.tone)).frame(width: 7, height: 7)
      Text(v.line).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(color(v.tone))
        .lineLimit(1).minimumScaleFactor(0.75)
    }
  }
}

private func number(_ n: Int, size: CGFloat) -> some View {
  Text("\(n)").font(.custom("Palatino-BoldItalic", size: size)).foregroundStyle(Color(hex: 0xF6F6F6))
    .lineLimit(1).minimumScaleFactor(0.5)
}

struct SmallStreak: View {
  let v: StreakView
  var body: some View {
    VStack(spacing: 2) {
      Label()
      if let n = v.streak {
        number(n, size: 76)
        Status(v: v)
      } else {
        Text(v.line).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
          .multilineTextAlignment(.center).padding(.top, 10)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct DaySquare: View {
  let mark: DayMark
  let tone: Tone
  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 7, style: .continuous)
    switch mark {
    case .active, .todayDone: shape.fill(green)
    case .today: shape.strokeBorder(color(tone), lineWidth: 2)
    case .missed: shape.strokeBorder(Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2.5]))
    case .future: shape.strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
    }
  }
}

struct MediumStreak: View {
  let v: StreakView
  private let letters = ["M", "T", "W", "T", "F", "S", "S"]
  var body: some View {
    // Signed out: just the message — no week of "missed" days.
    if v.streak == nil {
      VStack(alignment: .leading, spacing: 10) {
        Label()
        Text(v.line).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(20)
    } else {
      streakBody
    }
  }

  private var streakBody: some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        Label()
        Spacer(minLength: 0)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          number(v.streak ?? 0, size: 72)
          Text(v.streak == 1 ? "day" : "days").font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.6))
        }
        Spacer(minLength: 0)
        Status(v: v)
      }
      .frame(width: 132, alignment: .leading)

      Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)

      VStack(alignment: .leading, spacing: 10) {
        Grid(horizontalSpacing: 6, verticalSpacing: 6) {
          GridRow {
            ForEach(0..<7, id: \.self) { i in
              Text(letters[i]).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.5))
            }
          }
          GridRow {
            ForEach(0..<7, id: \.self) { i in
              DaySquare(mark: v.week[i], tone: v.tone).frame(width: 20, height: 20)
            }
          }
        }
        Text("THIS WEEK").font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(.white.opacity(0.55))
      }
      .frame(maxWidth: .infinity)
    }
    .padding(16)
  }
}

struct StreakWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: StreakEntry
  var body: some View {
    Group {
      if family == .systemMedium { MediumStreak(v: entry.view) } else { SmallStreak(v: entry.view) }
    }
    .containerBackground(for: .widget) {
      halo(entry.view, x: family == .systemMedium ? 0.25 : 0.5, radius: family == .systemMedium ? 260 : 150)
    }
  }
}

struct StreakWidget: Widget {
  let kind = "MerciaStreak"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      StreakWidgetView(entry: entry)
    }
    .configurationDisplayName("Day Streak")
    .description("Your Mercia streak. Do anything in the app each day to keep it going.")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}
