// Paper Fund: iPhone home-screen widget for the $100 paper-trading fund.
// Runs in the free Scriptable app (App Store). Reads the numbers the fund publishes beside its dashboard:
//   https://omar-akermi.github.io/paper-fund-dashboard/widget.json
// Sizes: small (value + chart), medium (value, today, chart, positions), large (bigger chart, every position).
// Tap the widget to open the full dashboard.

const BASE = "https://omar-akermi.github.io/paper-fund-dashboard/"
const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#15191e")),
  ink: Color.dynamic(new Color("#1b1f24"), new Color("#e6e9ee")),
  mute: Color.dynamic(new Color("#5e6773"), new Color("#98a2ae")),
  line: Color.dynamic(new Color("#e3e6ea"), new Color("#2a323b")),
  up: Color.dynamic(new Color("#178a4c"), new Color("#3ccf7f")),
  down: Color.dynamic(new Color("#c8372d"), new Color("#ff6b5e")),
  idle: new Color("#b7791f"),
}
// DrawContext images cannot follow light/dark mode on their own, so the chart picks its colors up front
const DARK = Device.isUsingDarkAppearance()
const HEX = DARK ? { up: "#3ccf7f", down: "#ff6b5e", base: "#5b6673" } : { up: "#178a4c", down: "#c8372d", base: "#9aa3ad" }

async function load() {
  const fm = FileManager.local()
  const cache = fm.joinPath(fm.cacheDirectory(), "paperfund.json")
  try {
    const req = new Request(BASE + "widget.json?t=" + Date.now())   // skip GitHub's 10-minute cache
    req.timeoutInterval = 15
    const d = await req.loadJSON()
    if (!d || !d.curve) throw new Error("no data")
    fm.writeString(cache, JSON.stringify(d))
    return { d, stale: false }
  } catch (e) {
    if (fm.fileExists(cache)) return { d: JSON.parse(fm.readString(cache)), stale: true }
    return { d: null, stale: true }
  }
}

const money = v => (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(2)
const signed = v => (v >= 0 ? "+$" : "−$") + Math.abs(v).toFixed(2)
const pct = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%"

function chart(curve, start, w, h) {
  const ctx = new DrawContext()
  ctx.size = new Size(w, h)
  ctx.opaque = false
  ctx.respectScreenScale = true
  const vs = curve.map(p => p[1])
  if (vs.length < 2) vs.push(vs[0] ?? start)
  let lo = Math.min(start, ...vs), hi = Math.max(start, ...vs)
  const pad = Math.max((hi - lo) * 0.12, 0.25)          // keep a flat $100 line from filling the box edge to edge
  lo -= pad; hi += pad
  const x = i => (i / (vs.length - 1)) * w
  const y = v => h - ((v - lo) / (hi - lo)) * h
  const col = new Color(vs[vs.length - 1] >= start ? HEX.up : HEX.down)
  // area under the line
  const area = new Path()
  area.move(new Point(0, h))
  vs.forEach((v, i) => area.addLine(new Point(x(i), y(v))))
  area.addLine(new Point(w, h))
  area.closeSubpath()
  ctx.addPath(area)
  ctx.setFillColor(new Color(vs[vs.length - 1] >= start ? HEX.up : HEX.down, 0.15))
  ctx.fillPath()
  // starting-cash reference line, dashed
  ctx.setFillColor(new Color(HEX.base, 0.8))
  for (let px = 0; px < w; px += 8) ctx.fillRect(new Rect(px, y(start) - 0.5, 4, 1))
  // the line itself
  const line = new Path()
  vs.forEach((v, i) => (i ? line.addLine(new Point(x(i), y(v))) : line.move(new Point(x(i), y(v)))))
  ctx.addPath(line)
  ctx.setStrokeColor(col)
  ctx.setLineWidth(2)
  ctx.strokePath()
  // dot on the latest value
  ctx.setFillColor(col)
  ctx.fillEllipse(new Rect(w - 4, y(vs[vs.length - 1]) - 2.5, 5, 5))
  return ctx.getImage()
}

function text(stack, s, size, color, weight) {
  const t = stack.addText(s)
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.systemFont(size)
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.6
  return t
}

function build(d, stale, family) {
  const w = new ListWidget()
  w.backgroundColor = C.bg
  w.url = BASE
  w.setPadding(12, 14, 12, 14)
  w.refreshAfterDate = new Date(Date.now() + (d && d.open ? 10 : 30) * 60 * 1000)
  if (!d) {
    text(w, "Paper Fund", 13, C.mute, "semibold")
    w.addSpacer(6)
    text(w, "No data yet. Check your connection.", 12, C.ink)
    return w
  }
  const total = d.equity - d.start
  const up = total >= 0
  // header: name and market status
  const head = w.addStack()
  head.centerAlignContent()
  text(head, "Paper Fund", 12, C.mute, "semibold")
  head.addSpacer()
  const dot = head.addText("●")
  dot.font = Font.systemFont(9)
  dot.textColor = stale ? C.idle : d.open ? C.up : C.mute
  head.addSpacer(3)
  text(head, stale ? "offline" : d.open ? "open" + (d.ny_time ? " " + d.ny_time : "") : "closed", 11, C.mute)
  w.addSpacer(4)
  // value and change
  const row = w.addStack()
  row.bottomAlignContent()
  text(row, money(d.equity), family === "small" ? 24 : 28, C.ink, "bold")
  if (family !== "small") {
    row.addSpacer(8)
    const ch = row.addStack()
    ch.layoutVertically()
    text(ch, signed(total) + "  " + pct((total / d.start) * 100), 12, up ? C.up : C.down, "semibold")
    text(ch, signed(d.today) + " today", 11, d.today >= 0 ? C.up : C.down)
  } else {
    w.addSpacer(1)
    text(w, signed(total) + "  " + pct((total / d.start) * 100), 11, up ? C.up : C.down, "semibold")
  }
  w.addSpacer(6)
  // chart
  const cw = family === "small" ? 140 : 300, ch = family === "large" ? 150 : family === "small" ? 46 : 42
  const img = w.addImage(chart(d.curve, d.start, cw, ch))
  img.imageSize = new Size(cw, ch)
  img.resizable = true
  w.addSpacer(6)
  // positions
  if (family !== "small") {
    const ps = d.positions || []
    if (!ps.length) {
      text(w, "No open positions · " + d.trades + " trades closed", 11, C.mute)
    } else {
      const list = family === "large" ? ps : ps.slice(0, 3)
      const box = w.addStack()
      box.layoutVertically()
      box.spacing = family === "large" ? 4 : 2
      if (family === "large") text(box, "Open positions", 11, C.mute, "semibold")
      const line = family === "large" ? box : box.addStack()
      list.forEach((p, i) => {
        const r = family === "large" ? box.addStack() : line
        const px = p.price ?? p.entry
        const chg = (px / p.entry - 1) * 100
        if (family !== "large" && i) r.addSpacer(10)
        text(r, p.symbol, 11, C.ink, "semibold")
        r.addSpacer(4)
        text(r, pct(chg), 11, chg >= 0 ? C.up : C.down)
        if (family === "large") {
          r.addSpacer()
          text(r, "stop " + p.stop.toFixed(2) + " · target " + p.target.toFixed(2), 10, C.mute)
        }
      })
    }
  }
  w.addSpacer()
  // footer
  const foot = w.addStack()
  const day = d.days + (d.open ? 1 : 0)
  text(foot, d.days_target ? "Day " + Math.min(day, d.days_target) + " of " + d.days_target : "Day " + day, 9, C.mute)
  foot.addSpacer()
  text(foot, "updated " + d.updated.slice(11, 16), 9, C.mute)
  return w
}

const { d, stale } = await load()
const family = config.widgetFamily || "medium"
const widget = build(d, stale, family)
if (config.runsInWidget) Script.setWidget(widget)
else if (family === "small") await widget.presentSmall()
else if (family === "large") await widget.presentLarge()
else await widget.presentMedium()
Script.complete()
