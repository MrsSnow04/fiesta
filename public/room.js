const socket = io();
const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

// Элементы страницы
const roomEl = document.getElementById("room");
const joinBtn = document.getElementById("join");
const startBtn = document.getElementById("start");
const charEl = document.getElementById("character");


// Отображение кода комнаты
roomEl.innerText = "Комната: " + roomCode;

// Контейнеры для планшетов и угадываний
const skullsContainer = document.createElement("div");
skullsContainer.className = "skulls-container";
document.body.appendChild(skullsContainer);

const guessingContainer = document.createElement("div");
guessingContainer.className = "guessing-container";
document.body.appendChild(guessingContainer);

const nameInput = document.getElementById("name");

// -------------------
// Вход в комнату
// -------------------
joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) return;

  socket.emit("join-room", { roomCode, name });

  // блокируем ввод имени
  nameInput.disabled = true;
  nameInput.classList.add("name-locked");

  // меняем интерфейс
  joinBtn.style.display = "none";
  startBtn.style.display = "block";

  // показываем кто ты
  const youLabel = document.createElement("div");
  youLabel.className = "you-label";
  youLabel.innerText = `👤 Ты: ${name}`;
  nameInput.parentNode.insertBefore(youLabel, nameInput.nextSibling);
};


// -------------------
// Начало игры
// -------------------
startBtn.onclick = () => {
  socket.emit("start-game", roomCode);
  startBtn.style.display = "none";
};

socket.on("game-started", () => {
  startBtn.style.display = "none";
  console.log("[CLIENT] Игра началась");
});

// -------------------
// Обновление списка игроков
// -------------------
socket.on("players-update", players => {
  const ul = document.getElementById("players");
  ul.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.innerText = p.name;
    ul.appendChild(li);
  });
});

// -------------------
// Отображение персонажа игрока
// -------------------
socket.on("your-character", data => {
  charEl.innerHTML = `🎭 Твой персонаж: <b>${data.character}</b>`;

  let btn = document.getElementById("changeChar");

  if (data.canChange && !btn) {
    btn = document.createElement("button");
    btn.id = "changeChar";
    btn.innerText = "🔄 Сменить персонажа";
    btn.onclick = () => socket.emit("change-character", roomCode);
    charEl.after(btn);
  } else if (!data.canChange && btn) {
    btn.remove(); // убираем кнопку, когда нельзя менять
  }
});



// -------------------
// Планшеты для ассоциаций
// -------------------
socket.on("new-skull", (skull) => {
  const skullEl = document.createElement("div");
  skullEl.className = "skull-card";

  const title = document.createElement("h4");
  title.innerText = `Планшет для угадывания`;
  skullEl.appendChild(title);

  const input = document.createElement("input");
  input.placeholder = "Введите ассоциацию";
  input.value = skull.words.length > 0 ? skull.words[skull.words.length - 1] : "";
  skullEl.appendChild(input);

  const submitBtn = document.createElement("button");
  submitBtn.innerText = "Готово";
  skullEl.appendChild(submitBtn);

  submitBtn.onclick = () => {
    if (!input.value) return;
    socket.emit("submit-word", {
      roomCode,
      ownerId: skull.ownerId,
      word: input.value
    });
    skullEl.remove();
  };

  skullsContainer.appendChild(skullEl);
});

socket.on("skull-complete", (skull) => {
  alert(`Планшет игрока ${skull.ownerName} завершён!`);
});

// -------------------
// Угадывание персонажей
// -------------------
socket.on("start-guessing", ({ skulls }) => {
  guessingContainer.innerHTML = "<h3>Угадай персонажей!</h3>";

  const answersInputs = [];

  // 🔀 перемешиваем карточки
  const shuffledSkulls = shuffle(skulls);

  // список персонажей (один раз)
  const characters = skulls.map(s => s.correctCharacter);

  shuffledSkulls.forEach(skull => {
    const div = document.createElement("div");
    div.className = "guessing-card";
    div.innerHTML = `<p>Последнее слово на планшете игрока: "${skull.lastWord}"</p>`;

    const select = document.createElement("select");

    // 🔀 перемешиваем варианты персонажей
    shuffle(characters).forEach(character => {
      const opt = document.createElement("option");
      opt.value = character;
      opt.innerText = character;
      select.appendChild(opt);
    });

    div.appendChild(select);
    guessingContainer.appendChild(div);

    answersInputs.push({
      skullOwnerId: skull.ownerId,
      select
    });
  });

  const submitBtn = document.createElement("button");
  submitBtn.innerText = "Отправить ответы";
  submitBtn.className = "submit-answers-btn";
  guessingContainer.appendChild(submitBtn);

  submitBtn.onclick = () => {
    const playerAnswers = answersInputs.map(a => ({
      skullOwnerId: a.skullOwnerId,
      guessedCharacter: a.select.value
    }));

    socket.emit("submit-answers", { roomCode, playerAnswers });
    guessingContainer.innerHTML = "";
  };
});


// -------------------
// Отображение результатов и возможность начать заново
// -------------------
socket.on("guess-results", results => {
  // Показываем результаты
  let resultStr = "Результаты угадывания:\n";
  results.forEach(r => {
    resultStr += `${r.player}: ${r.correct} правильных\n`;
    resultStr += `Слова: ${r.words.join(", ")}\n\n`;
  });
  alert(resultStr);

  // Создаём кнопку "Начать заново"
  let restartBtn = document.getElementById("restartGame");
  if (!restartBtn) {
    restartBtn = document.createElement("button");
    restartBtn.id = "restartGame";
    restartBtn.innerText = "🔄 Начать игру заново";
    restartBtn.onclick = () => {
      socket.emit("start-game", roomCode);

      // Сбрасываем интерфейс
      skullsContainer.innerHTML = "";
      guessingContainer.innerHTML = "";
      restartBtn.remove(); // убираем кнопку после нажатия
    };
    document.body.appendChild(restartBtn);
  }
});

