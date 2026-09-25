import Foundation

// What the streak widget shows, worked out from the app's snapshot and the
// current time. Pure (no WidgetKit) so it can be tested with plain swiftc.
//
// A streak is alive today if yesterday was active; it gets more urgent through
// the user's own Morning → Afternoon → Night until they do anything in Mercia.

/// Written by the app into the App Group (key "streak").
struct Snapshot: Codable, Equatable {
  let v: Int
  let lastActive: String?          // YYYY-MM-DD
  let streakThroughLastActive: Int
  let recentActive: [String]       // last 14 days, YYYY-MM-DD
  let afternoonStart: Int          // minutes after midnight
  let nightStart: Int
}

enum Mood: Equatable { case done, morning, afternoon, night, start, signedOut }
enum Tone: Equatable { case green, calm, amber, red }
enum DayMark: Equatable { case active, today, todayDone, missed, future }

struct StreakView: Equatable {
  let mood: Mood
  let streak: Int?                 // nil when signed out
  let line: String
  let tone: Tone
  let week: [DayMark]              // Monday … Sunday of the current week
}

func ymd(_ date: Date, _ cal: Calendar) -> String {
  let c = cal.dateComponents([.year, .month, .day], from: date)
  return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

/// Afternoon/Night starts from the snapshot, kept to valid clock times (the
/// widget must never crash on a bad value): 0…1439, night after afternoon.
func dayParts(_ s: Snapshot?) -> (Int, Int) {
  let afternoon = min(max(s?.afternoonStart ?? 720, 0), 1438)
  let night = min(max(s?.nightStart ?? 1080, afternoon + 1), 1439)
  return (afternoon, night)
}

private func partTone(_ minutes: Int, _ s: Snapshot) -> (Mood, Tone, String) {
  let (afternoon, night) = dayParts(s)
  if minutes < afternoon { return (.morning, .calm, "Keep it going") }
  if minutes < night { return (.afternoon, .amber, "Don't forget") }
  return (.night, .red, "Streak at risk")
}

private func weekMarks(_ now: Date, _ cal: Calendar, active: Set<String>) -> [DayMark] {
  let today = cal.startOfDay(for: now)
  let fromMonday = (cal.component(.weekday, from: today) + 5) % 7 // Mon = 0 … Sun = 6
  let monday = cal.date(byAdding: .day, value: -fromMonday, to: today)!
  let todayKey = ymd(today, cal)
  return (0..<7).map { i in
    let key = ymd(cal.date(byAdding: .day, value: i, to: monday)!, cal)
    if key > todayKey { return .future }
    if key == todayKey { return active.contains(key) ? .todayDone : .today }
    return active.contains(key) ? .active : .missed
  }
}

func streakState(_ snap: Snapshot?, now: Date, calendar cal: Calendar) -> StreakView {
  guard let s = snap, s.v == 1 else {
    return StreakView(mood: .signedOut, streak: nil, line: "Open Mercia to start your streak", tone: .calm,
                      week: weekMarks(now, cal, active: []))
  }
  let today = ymd(now, cal)
  let yesterday = ymd(cal.date(byAdding: .day, value: -1, to: now)!, cal)
  var active = Set(s.recentActive)
  if let last = s.lastActive { active.insert(last) }
  let week = weekMarks(now, cal, active: active)

  if s.lastActive == today {
    return StreakView(mood: .done, streak: s.streakThroughLastActive, line: "Done for today", tone: .green, week: week)
  }
  let c = cal.dateComponents([.hour, .minute], from: now)
  let (mood, tone, line) = partTone(c.hour! * 60 + c.minute!, s)
  if s.lastActive == yesterday {
    return StreakView(mood: mood, streak: s.streakThroughLastActive, line: line, tone: tone, week: week)
  }
  return StreakView(mood: .start, streak: 0, line: "Start a streak today", tone: tone, week: week)
}

/// When the widget should next redraw: today's Afternoon and Night starts (if
/// still ahead), then midnight and tomorrow's starts — the next 24h or so.
/// Clock times are set through the calendar so daylight-saving days still flip
/// at 12:00 / 18:00 local, not an hour off.
func nextRefreshDates(_ snap: Snapshot?, now: Date, calendar cal: Calendar) -> [Date] {
  let (afternoon, night) = dayParts(snap)
  let today = cal.startOfDay(for: now)
  let tomorrow = cal.date(byAdding: .day, value: 1, to: today)!
  let clock = { (minutes: Int, day: Date) in
    cal.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day)
  }
  let candidates = [clock(afternoon, today), clock(night, today), tomorrow, clock(afternoon, tomorrow), clock(night, tomorrow)]
    .compactMap { $0 }
  // Everything up to the same clock time tomorrow (covers 23/25-hour days).
  let limit = cal.date(byAdding: .day, value: 1, to: now)!
  return candidates.filter { $0 > now && $0 <= limit }.sorted()
}
