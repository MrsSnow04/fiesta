const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const CHARACTERS = fs
  .readFileSync(path.join(__dirname, "characters.txt"), "utf8")
  .split("\n")
  .map(l => l.trim())
  .filter(Boolean);

const rooms = {};
const skulls = {};
const answers = {};

function getRandomFreeCharacter(room) {
  const used = room.players.map(p => p.character).filter(Boolean);
  const free = CHARACTERS.filter(c => !used.includes(c));
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

io.on("connection", socket => {

  socket.on("create-room", () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[code] = { players: [] };
    socket.join(code);
    socket.emit("room-created", code);
  });

  socket.on("join-room", ({ roomCode, name }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.players.push({
      id: socket.id,
      name,
      character: null,
      hasWritten: false
    });

    socket.join(roomCode);
    io.to(roomCode).emit(
      "players-update",
      room.players.map(p => ({ name: p.name }))
    );
  });

  socket.on("start-game", roomCode => {
    const room = rooms[roomCode];
    if (!room) return;

    // Раздаём персонажей
    room.players.forEach(p => {
      p.character = getRandomFreeCharacter(room);
      p.hasWritten = false;
      io.to(p.id).emit("your-character", {
        character: p.character,
        canChange: true
      });
    });

    // Создаём планшеты
    const cycleCount = room.players.length <= 3 ? 2 : 1;
    skulls[roomCode] = room.players.map(p => ({
      ownerId: p.id,
      ownerName: p.name,
      words: [],
      stepsNeeded: room.players.length * cycleCount,
      completed: false,
      correctCharacter: p.character
    }));

    room.players.forEach((p, i) => {
      io.to(p.id).emit("new-skull", skulls[roomCode][i]);
    });

    answers[roomCode] = {};
  });

  socket.on("change-character", roomCode => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasWritten) return;

    const newChar = getRandomFreeCharacter(room);
    if (!newChar) return;

    player.character = newChar;

    // Обновляем correctCharacter на планшете игрока
    const playerSkull = skulls[roomCode].find(s => s.ownerId === socket.id);
    if (playerSkull) playerSkull.correctCharacter = newChar;

    io.to(player.id).emit("your-character", {
      character: newChar,
      canChange: true
    });
  });

  socket.on("submit-word", ({ roomCode, ownerId, word }) => {
    const room = rooms[roomCode];
    const skull = skulls[roomCode].find(s => s.ownerId === ownerId);
    const player = room.players.find(p => p.id === socket.id);
    if (!skull || !player) return;

    player.hasWritten = true;
    skull.words.push(word);

    const ids = room.players.map(p => p.id);
    const nextId = ids[(ids.indexOf(socket.id) + 1) % ids.length];

    if (skull.words.length < skull.stepsNeeded) {
      io.to(nextId).emit("new-skull", skull);
    } else {
      skull.completed = true;
      if (skulls[roomCode].every(s => s.completed)) {
        io.to(roomCode).emit("start-guessing", {
          skulls: skulls[roomCode].map(s => ({
            ownerId: s.ownerId,
            ownerName: s.ownerName,
            lastWord: s.words.at(-1),
            correctCharacter: s.correctCharacter
          }))
        });
      }
    }
  });

  socket.on("submit-answers", ({ roomCode, playerAnswers }) => {
    answers[roomCode][socket.id] = playerAnswers;

    const room = rooms[roomCode];
    if (Object.keys(answers[roomCode]).length !== room.players.length) return;

    const results = room.players.map(p => {
      let correct = 0;
      answers[roomCode][p.id].forEach(a => {
        const skull = skulls[roomCode].find(s => s.ownerId === a.skullOwnerId);
        if (a.guessedCharacter === skull.correctCharacter) correct++;
      });
      return { player: p.name, correct };
    });

    io.to(roomCode).emit("guess-results", results);
  });

});
server.listen(3000, () =>
  console.log("http://localhost:3000")
);
