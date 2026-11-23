// ZERO - Realtime Chat | Final Activity | Author: Art London Balangue
// Node.js built-in modules only. Realtime push via Server-Sent Events (SSE).
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 3000;
const ROOMS = ["balangue"];
const clients = new Map();                       // id -> {res, name, room, color}
const history = Object.fromEntries(ROOMS.map((r) => [r, []]));
let nextId = 1, nextMsg = 1;

const send = (c, ev, d) => c.res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
const inRoom = (room) => [...clients.values()].filter((c) => c.room === room);
const broadcast = (room, ev, d) => inRoom(room).forEach((c) => send(c, ev, d));
const roster = (room) => inRoom(room).map((c) => ({ name: c.name, color: c.color }));
const counts = () => Object.fromEntries(ROOMS.map((r) => [r, inRoom(r).length]));
const pushCounts = () => clients.forEach((c) => send(c, "counts", counts()));
const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (x) => (b += x)); req.on("end", () => { try { ok(JSON.parse(b)); } catch { ok({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/events") {                         // open realtime stream
    const room = ROOMS.includes(url.searchParams.get("room")) ? url.searchParams.get("room") : "balangue";
    const name = (url.searchParams.get("name") || "Guest").slice(0, 16);
    const color = Number(url.searchParams.get("color")) || 200;
    const id = nextId++;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const c = { res, name, room, color };
    clients.set(id, c);
    send(c, "welcome", { id, rooms: ROOMS, history: history[room] });
    broadcast(room, "system", { text: `${name} joined the chat`, roster: roster(room) });
    pushCounts();
    console.log(`[+] ${name} joined #${room} (online: ${clients.size})`);
    req.on("close", () => {
      clients.delete(id);
      broadcast(room, "system", { text: `${name} left the chat`, roster: roster(room) });
      pushCounts();
      console.log(`[-] ${name} left #${room} (online: ${clients.size})`);
    });
    return;
  }

  if (req.method === "POST" && ["/send", "/typing", "/react"].includes(url.pathname)) {
    const d = await body(req), c = clients.get(d.id);
    if (!c) return res.writeHead(400).end("no session");
    if (url.pathname === "/send" && d.text && String(d.text).trim()) {
      const m = { id: nextMsg++, name: c.name, color: c.color, text: String(d.text).slice(0, 500), reactions: {},
                  time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) };
      history[c.room].push(m); if (history[c.room].length > 60) history[c.room].shift();
      console.log(`[#${c.room}] ${c.name}: ${m.text}`);
      broadcast(c.room, "message", m);
    }
    if (url.pathname === "/typing") inRoom(c.room).filter((x) => x !== c).forEach((x) => send(x, "typing", { name: c.name }));
    if (url.pathname === "/react") {
      const m = history[c.room].find((x) => x.id === d.msgId);
      if (m && ["👍", "❤️", "😂", "🔥"].includes(d.emoji)) {
        const list = (m.reactions[d.emoji] = m.reactions[d.emoji] || []);
        const i = list.indexOf(c.name); i < 0 ? list.push(c.name) : list.splice(i, 1);
        if (!list.length) delete m.reactions[d.emoji];
        broadcast(c.room, "reaction", { id: m.id, reactions: m.reactions });
      }
    }
    return res.writeHead(200).end("ok");
  }

  if (url.pathname === "/logo.png") return fs.createReadStream(path.join(__dirname, "public", "logo.png")).pipe(res.writeHead(200, { "Content-Type": "image/png" }));
  if (url.pathname === "/") return fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res.writeHead(200, { "Content-Type": "text/html" }));
  res.writeHead(404).end("Not found");
}).listen(PORT, () => console.log(`ZERO realtime chat running at http://localhost:${PORT}`));
