// --- 1. SUPABASE INITIALIZATION ---
const supabaseUrl = 'https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let mySessionId = null;
let arenaChannel = null;

// --- 2. GAME STATE & PROFILE VARIABLES ---
let myNickname = "Player";
let myAvatar = "🥷";
let currentAnswer = 0;
let p1Score = 0;
let p2Score = 0;
let tugPosition = 50; 
let gameStarted = false; 
let isHostPlayer = false; 
let countdownTimer = null; 

// UI Elements
const gridEl = document.getElementById('question-grid');
const inputEl = document.getElementById('answer-input');
const tugBarEl = document.getElementById('tug-bar');
const p1ScoreEl = document.getElementById('score-p1');
const p2ScoreEl = document.getElementById('score-p2');
const oppStatusEl = document.getElementById('opp-status');

// --- 3. AUTO QUESTION GENERATOR ---
function generateQuestion(digits, rows) {
    let sumArray = [];
    let runningTotal = 0;
    for (let i = 0; i < rows; i++) {
        let num;
        let max = Math.pow(10, digits) - 1; 
        let min = Math.pow(10, digits - 1); 
        if (digits === 1) min = 1;
        let isMinus = i === 0 ? false : Math.random() > 0.5;
        do {
             num = Math.floor(Math.random() * (max - min + 1)) + min;
        } while (isMinus && (runningTotal - num < 0));
        if (isMinus) num = -num;
        sumArray.push(num);
        runningTotal += num;
    }
    return sumArray;
}

// --- 4. LOBBY LOGIC ---
function selectAvatar(emoji) {
    myAvatar = emoji;
    const buttons = document.querySelectorAll('.avatar-btn');
    buttons.forEach(btn => btn.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

async function joinLobby() {
    const nameInput = document.getElementById('player-name-input').value.trim();
    if (nameInput === "") {
        alert("Please enter a Nickname first!");
        return;
    }
    myNickname = nameInput;
    document.getElementById('my-name-display').textContent = myNickname;
    document.getElementById('my-avatar-display').textContent = myAvatar;
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('battle-container').style.display = 'flex';
    await initBattle();
}

// --- 5. SUPABASE AUTH & REALTIME LOGIC ---
async function initBattle() {
    const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
    if (authError) return console.error("Auth Error:", authError);
    mySessionId = authData.user.id;

    arenaChannel = supabaseClient.channel('battle_room_1', {
        config: { presence: { key: mySessionId } },
    });

    arenaChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = arenaChannel.presenceState();
            const activeIds = Object.keys(newState);
            const playersOnline = activeIds.length;
            
            if (playersOnline > 1) {
                activeIds.sort();
                isHostPlayer = (activeIds[0] === mySessionId);

                for (let id in newState) {
                    if (id !== mySessionId) {
                        const oppData = newState[id][0];
                        document.getElementById('opp-name-display').textContent = oppData.nickname || "Opponent";
                        document.getElementById('opp-avatar-display').textContent = oppData.avatar || "🤖";
                        oppStatusEl.textContent = "Ready to battle!";
                        oppStatusEl.style.color = "#4ade80"; 
                    }
                }
                
                if (!gameStarted) {
                    gameStarted = true;
                    startCountdown();
                }

            } else {
                if (gameStarted) {
                    alert("Opponent disconnected! Waiting for a new challenger...");
                }
                
                gameStarted = false;
                isHostPlayer = false;
                clearInterval(countdownTimer);

                document.getElementById('opp-name-display').textContent = "Opponent";
                document.getElementById('opp-avatar-display').textContent = "🤖";
                oppStatusEl.textContent = "Waiting for opponent...";
                oppStatusEl.style.color = "#facc15"; 
                
                gridEl.innerHTML = '<div style="font-size: 20px; color: #94a3b8; text-align: center; border: none; padding-top: 50px;">Waiting for a challenger...</div>';
                inputEl.disabled = true;
            }
        })
        
        // BUG FIX: Notice how we look inside "message.payload" now!
        .on('broadcast', { event: 'sync_question' }, (message) => {
            const data = message.payload; // Opening the envelope!
            if (data.senderId !== mySessionId) {
                clearInterval(countdownTimer); // Kill local timer to prevent overwriting
                loadQuestion(data.question);
                oppStatusEl.textContent = "Calculating...";
                oppStatusEl.style.color = "#94a3b8";
            }
        })
        
        .on('broadcast', { event: 'correct_answer' }, (message) => {
            const data = message.payload; // Opening the envelope!
            if (data.winner !== mySessionId) {
                inputEl.disabled = true;
                oppStatusEl.textContent = "Opponent answered first! ⚡";
                oppStatusEl.style.color = "#ef4444";
                updateScore('p2');
                
                setTimeout(() => {
                    loadQuestion(data.nextQuestion); 
                    oppStatusEl.textContent = "Calculating...";
                    oppStatusEl.style.color = "#94a3b8";
                }, 1500); 
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await arenaChannel.track({ nickname: myNickname, avatar: myAvatar });
            }
        });
}

// --- 6. THE 3-2-1 COUNTDOWN ---
function startCountdown() {
    inputEl.disabled = true;
    let count = 3;
    
    gridEl.innerHTML = `<div style="font-size: 30px; color: #facc15; text-align: center; border: none; padding-top: 30px;">Opponent Found!<br><br>Starting in ${count}</div>`;

    countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
            gridEl.innerHTML = `<div style="font-size: 30px; color: #facc15; text-align: center; border: none; padding-top: 30px;">Opponent Found!<br><br>Starting in ${count}</div>`;
        } else {
            clearInterval(countdownTimer);
            gridEl.innerHTML = `<div style="font-size: 40px; color: #4ade80; text-align: center; border: none; padding-top: 50px;">GO!</div>`;
            
            if (isHostPlayer) {
                setTimeout(() => {
                    const firstQ = generateQuestion(1, 5);
                    loadQuestion(firstQ);
                    
                    arenaChannel.send({
                        type: 'broadcast',
                        event: 'sync_question',
                        payload: { question: firstQ, senderId: mySessionId }
                    });
                }, 1000);
            }
        }
    }, 1000);
}

// --- 7. GAME UI LOGIC ---
function loadQuestion(numbersArray) {
    if (!numbersArray) return; // Safety guard against empty arrays
    gridEl.innerHTML = ''; 
    currentAnswer = 0;
    inputEl.disabled = false; 
    inputEl.value = ''; 
    inputEl.focus();

    numbersArray.forEach((num, index) => {
        currentAnswer += num;
        const row = document.createElement('div');
        let displayStr = (num > 0 && index !== 0) ? `+ ${num}` : num.toString();
        row.textContent = displayStr;
        gridEl.appendChild(row);
    });
}

function submitAnswer() {
    const userAnswer = parseInt(inputEl.value, 10);
    if (isNaN(userAnswer)) return;

    if (userAnswer === currentAnswer) {
        inputEl.disabled = true; 
        inputEl.style.backgroundColor = '#4ade80'; 
        updateScore('p1');
        
        const nextQ = generateQuestion(1, 5);
        
        arenaChannel.send({
            type: 'broadcast',
            event: 'correct_answer',
            payload: { 
                winner: mySessionId,
                nextQuestion: nextQ 
            }
        });

        setTimeout(() => {
            inputEl.style.backgroundColor = 'white';
            loadQuestion(nextQ); 
        }, 1500);

    } else {
        inputEl.style.backgroundColor = '#fca5a5';
        setTimeout(() => inputEl.style.backgroundColor = 'white', 500);
        inputEl.value = '';
    }
}

function updateScore(winner) {
    if (winner === 'p1') {
        p1Score += 10;
        p1ScoreEl.textContent = p1Score;
        tugPosition += 10; 
    } else {
        p2Score += 10;
        p2ScoreEl.textContent = p2Score;
        tugPosition -= 10; 
    }
    tugPosition = Math.max(5, Math.min(95, tugPosition));
    tugBarEl.style.width = `${tugPosition}%`;
}

inputEl.addEventListener("keypress", function(event) {
  if (event.key === "Enter" && !inputEl.disabled) {
    event.preventDefault();
    submitAnswer();
  }
});
