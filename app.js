import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Firebase設定
const firebaseConfig = {
apiKey: "AIzaSyA8_yHlP1ZjffOLJZLbLw3b9kF6VFiiNVQ",
authDomain: "poke-hit-and-blow.firebaseapp.com",
databaseURL: "https://poke-hit-and-blow-default-rtdb.firebaseio.com",
projectId: "poke-hit-and-blow",
storageBucket: "poke-hit-and-blow.firebasestorage.app",
messagingSenderId: "470834001212",
appId: "1:470834001212:web:12f707ecda3115d00c9a39",
measurementId: "G-9VQ67SGBT1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const typeMap = {
    normal: "ノーマル", fire: "ほのお", water: "みず", grass: "くさ",
    electric: "でんき", ice: "こおり", fighting: "かくとう", poison: "どく",
    ground: "じめん", flying: "ひこう", psychic: "エスパー", bug: "むし",
    rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン", steel: "はがね",
    fairy: "フェアリー", dark: "あく"
};

let myName = "";
let myRole = ""; // "player1" | "player2"
let currentRoomId = "";
let roomRef = null;
let timerInterval = null;

// DOM要素
const screenTitle = document.getElementById("screenTitle");
const screenRoom = document.getElementById("screenRoom");
const screenConfig = document.getElementById("screenConfig");
const screenGame = document.getElementById("screenGame");

const playerNameInput = document.getElementById("playerNameInput");
const roomNameInput = document.getElementById("roomNameInput");
const roomStatusMsg = document.getElementById("roomStatusMsg");

const hostConfigArea = document.getElementById("hostConfigArea");
const guestWaitArea = document.getElementById("guestWaitArea");
const btnStartGame = document.getElementById("btnStartGame");

const turnIndicator = document.getElementById("turnIndicator");
const timerIndicator = document.getElementById("timerIndicator");
const hintArea = document.getElementById("hintArea");
const guessArea = document.getElementById("guessArea");
const guessInput = document.getElementById("guessInput");
const btnSendGuess = document.getElementById("btnSendGuess");
const historyTableBody = document.getElementById("historyTableBody");

const resultArea = document.getElementById("resultArea");
const resultAnswer = document.getElementById("resultAnswer");
const resultWinner = document.getElementById("resultWinner");
const btnRematch = document.getElementById("btnRematch");
const rematchStatus = document.getElementById("rematchStatus");

function showScreen(screen) {
    [screenTitle, screenRoom, screenConfig, screenGame].forEach(s => s.classList.remove("active"));
    screen.classList.add("active");
}

// ランダムなカタカナ6文字の生成
function getRandomKatakana6() {
    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// タイトル画面処理
document.getElementById("btnTitleNext").addEventListener("click", () => {
    myName = playerNameInput.value.trim();
    if (!myName) return alert("プレイヤー名を入力してください");
    showScreen(screenRoom);
});

document.getElementById("btnBackToTitle").addEventListener("click", () => {
    showScreen(screenTitle);
});

// マッチング処理
document.getElementById("btnJoinRoom").addEventListener("click", async () => {
    const roomId = roomNameInput.value.trim();
    if (!roomId) return alert("合言葉を入力してください");

    currentRoomId = roomId;
    roomRef = ref(db, `rooms/${roomId}`);
    roomStatusMsg.textContent = "部屋を確認中...";

    try {
        const snapshot = await get(roomRef);
        const data = snapshot.val();

        if (!data || !data.player1) {
            myRole = "player1";
            await set(roomRef, {
                player1: { name: myName, rematch: false },
                player2: false,
                status: "waiting"
            });
            onDisconnect(roomRef).remove();
            roomStatusMsg.textContent = "対戦相手を待っています...";
            listenRoom();
        } else if (data.player1 && !data.player2) {
            myRole = "player2";
            await update(roomRef, {
                "player2": { name: myName, rematch: false },
                "status": "config"
            });
            onDisconnect(roomRef).remove();
            listenRoom();
        } else {
            roomStatusMsg.textContent = "その合言葉の部屋は満室です。";
        }
    } catch (e) {
        console.error(e);
        roomStatusMsg.textContent = "通信エラーが発生しました。";
    }
});

// ポケモンデータ取得
async function getRandomPokemonData() {
    const id = Math.floor(Math.random() * 1025) + 1;
    const [speciesRes, pokemonRes] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`),
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`)
    ]);

    const speciesData = await speciesRes.json();
    const pokemonData = await pokemonRes.json();

    const jaEntry = speciesData.names.find(n => n.language.name === "ja-Hrkt" || n.language.name === "ja");
    const name = jaEntry ? jaEntry.name : "ピカチュウ";

    const genUrlParts = speciesData.generation.url.split('/').filter(Boolean);
    const genId = genUrlParts[genUrlParts.length - 1];
    const generationText = `第${genId}世代`;

    const typesText = pokemonData.types
        .map(t => typeMap[t.type.name] || t.type.name)
        .join('/');

    return { name, generation: generationText, types: typesText };
}

// ホストのゲーム開始処理
btnStartGame.addEventListener("click", async () => {
    btnStartGame.disabled = true;
    const selectedLimit = parseInt(document.querySelector('input[name="timeLimit"]:checked').value, 10);
    const pokeData = await getRandomPokemonData();
    const firstTurn = Math.random() < 0.5 ? "player1" : "player2";

    await update(roomRef, {
        targetName: pokeData.name,
        targetGen: pokeData.generation,
        targetTypes: pokeData.types,
        currentTurn: firstTurn,
        timeLimit: selectedLimit,
        turnStartTime: Date.now(),
        status: "playing",
        history: []
    });
});

// 部屋の状態監視
function listenRoom() {
    onValue(roomRef, async (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert("対戦相手が退出したか、部屋が解散されました。");
            location.reload();
            return;
        }

        if (data.status === "config") {
            showScreen(screenConfig);
            if (myRole === "player1") {
                hostConfigArea.style.display = "block";
                guestWaitArea.style.display = "none";
            } else {
                hostConfigArea.style.display = "none";
                guestWaitArea.style.display = "block";
            }
            return;
        }

        if (data.status === "playing" || data.status === "finished") {
            showScreen(screenGame);
            renderGame(data);
        }
    });
}

function checkHitBlow(targetStr, guessStr) {
    const target = targetStr.padEnd(6, ' ').split('');
    const guess = guessStr.padEnd(6, ' ').split('');

    let hit = 0;
    let blow = 0;
    const targetUsed = new Array(6).fill(false);
    const guessUsed = new Array(6).fill(false);

    for (let i = 0; i < 6; i++) {
        if (target[i] === guess[i]) {
            hit++;
            targetUsed[i] = true;
            guessUsed[i] = true;
        }
    }

    for (let i = 0; i < 6; i++) {
        if (guessUsed[i]) continue;
        for (let j = 0; j < 6; j++) {
            if (targetUsed[j]) continue;
            if (guess[i] === target[j]) {
                blow++;
                targetUsed[j] = true;
                break;
            }
        }
    }

    return { hit, blow };
}

// 共通送信処理
async function submitGuess(guessText) {
    btnSendGuess.disabled = true;
    guessInput.disabled = true;

    const snapshot = await get(roomRef);
    const data = snapshot.val();
    if (!data || data.status !== "playing") return;

    const { hit, blow } = checkHitBlow(data.targetName, guessText);
    const history = data.history || [];

    history.push({
        player: myRole,
        playerName: myName,
        guess: guessText,
        hit: hit,
        blow: blow
    });

    const updates = { 
        history: history,
        turnStartTime: Date.now()
    };

    if (hit === 6) {
        updates.status = "finished";
        updates.winner = myRole;
    } else {
        updates.currentTurn = myRole === "player1" ? "player2" : "player1";
    }

    await update(roomRef, updates);
    guessInput.value = "";
}

// タイマー起動
function startTimer(timeLimit, turnStartTime, isMyTurn) {
    if (timerInterval) clearInterval(timerInterval);

    if (!timeLimit || timeLimit === 0) {
        timerIndicator.textContent = "制限時間: 無制限";
        return;
    }

    const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        const remaining = timeLimit - elapsed;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerIndicator.textContent = "時間切れ！";
            if (isMyTurn) {
                // 時間切れ時にランダムな6文字を自動送信
                submitGuess(getRandomKatakana6());
            }
        } else {
            timerIndicator.textContent = `残り時間: ${remaining}秒`;
        }
    };

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

// ゲーム画面描画
function renderGame(data) {
    const history = data.history || [];

    historyTableBody.innerHTML = "";
    for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${item.playerName}</td>
            <td>${item.guess}</td>
            <td>${item.hit}</td>
            <td>${item.blow}</td>
        `;
        historyTableBody.appendChild(tr);
    }

    if (data.status === "playing") {
        resultArea.style.display = "none";
        turnIndicator.style.display = "block";
        timerIndicator.style.display = "block";
        guessArea.style.display = "block";

        const currentTurnNumber = history.length + 1;
        const hints = [];

        if (currentTurnNumber >= 5) hints.push(`文字数: 「${data.targetName.length}文字」`);
        if (currentTurnNumber >= 7) hints.push(`初出作品: 「${data.targetGen}」`);
        if (currentTurnNumber >= 10) hints.push(`タイプ: 「${data.targetTypes}」`);

        if (hints.length > 0) {
            hintArea.textContent = `💡 ヒント\n` + hints.join(' / ');
            hintArea.style.display = "block";
        } else {
            hintArea.style.display = "none";
        }

        const isMyTurn = data.currentTurn === myRole;
        const currentTurnPlayerName = data[data.currentTurn].name;

        if (isMyTurn) {
            turnIndicator.textContent = "あなたのターンです！予測を入力してください。";
            turnIndicator.className = "turn-info my-turn";
            guessInput.disabled = false;
            btnSendGuess.disabled = false;
        } else {
            turnIndicator.textContent = `${currentTurnPlayerName} の思考中です...`;
            turnIndicator.className = "turn-info";
            guessInput.disabled = true;
            btnSendGuess.disabled = true;
        }

        startTimer(data.timeLimit, data.turnStartTime, isMyTurn);

    } else if (data.status === "finished") {
        if (timerInterval) clearInterval(timerInterval);
        
        // プレイ中の要素を非表示にして結果エリアのみ最上部に表示
        turnIndicator.style.display = "none";
        timerIndicator.style.display = "none";
        hintArea.style.display = "none";
        guessArea.style.display = "none";
        resultArea.style.display = "block";

        resultAnswer.textContent = `正解は「${data.targetName}」でした！`;
        const winnerName = data[data.winner].name;
        resultWinner.textContent = `${winnerName} の勝利！`;

        const p1Rematch = data.player1?.rematch;
        const p2Rematch = data.player2?.rematch;

        if (p1Rematch && p2Rematch) {
            rematchStatus.textContent = "両者が再戦を選択しました。次のゲームを開始します...";
            if (myRole === "player1") {
                (async () => {
                    const pokeData = await getRandomPokemonData();
                    const firstTurn = Math.random() < 0.5 ? "player1" : "player2";
                    await update(roomRef, {
                        targetName: pokeData.name,
                        targetGen: pokeData.generation,
                        targetTypes: pokeData.types,
                        currentTurn: firstTurn,
                        turnStartTime: Date.now(),
                        status: "playing",
                        history: [],
                        "player1/rematch": false,
                        "player2/rematch": false
                    });
                })();
            }
        } else if (p1Rematch || p2Rematch) {
            const waitingRole = p1Rematch ? "player1" : "player2";
            rematchStatus.textContent = `${data[waitingRole].name} が再戦を希望しています...`;
        } else {
            rematchStatus.textContent = "";
        }
    }
}

// 手動送信ボタン
btnSendGuess.addEventListener("click", () => {
    let guess = guessInput.value.trim();
    if (!guess) return alert("ポケモンの名前を入力してください");

    guess = guess.replace(/[\u3041-\u3096]/g, (match) => {
        return String.fromCharCode(match.charCodeAt(0) + 0x60);
    });

    submitGuess(guess);
});

// 再戦ボタン
btnRematch.addEventListener("click", async () => {
    btnRematch.disabled = true;
    await update(roomRef, {
        [`${myRole}/rematch`]: true
    });
});

// 退出ボタン
document.getElementById("btnExit").addEventListener("click", async () => {
    if (roomRef) await remove(roomRef);
    location.reload();
});

// Enterキー入力でも送信する処理
guessInput.addEventListener("keydown", (event) => {
    // 変換中のEnter押下誤作動を防ぎつつ、Enterキーでボタンクリックを実行
    if (event.key === "Enter" && !event.isComposing && !btnSendGuess.disabled) {
        event.preventDefault();
        btnSendGuess.click();
    }
});
