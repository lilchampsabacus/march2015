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

// UI Elements
const gridEl = document.getElementById('question-grid');
const inputEl = document.getElementById('answer-input');
const tugBarEl = document.getElementById('tug-bar');
const p1ScoreEl = document.getElementById('score-p1');
const p2ScoreEl = document.getElementById('score-p2');
const oppStatusEl = document.getElementById('opp-status');

// Sample Data 
const sample1D5R = [5, -2, 4, -1, 3];
const nextQuestion = [8, -5, 2, -1, 4]; 

// --- 3. LOBBY LOGIC ---
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

    // Update the UI
    document.getElementById('my-name-display').textContent = myNickname;
    document.getElementById('my-avatar-display').textContent = myAvatar;

    // Transition from Lobby to Arena
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('battle-container').style.display = 'flex';

    // Boot up connection
    await initBattle();
}

// --- 4. SUPABASE AUTH & REALTIME LOGIC ---
async function initBattle() {
    // ⚠️ CRITICAL FIX: Make sure this says 'supabaseClient.auth'
    const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
    if (authError) return console.error("Auth Error:", authError);
    mySessionId = authData.user.id;

    // ⚠️ CRITICAL FIX: Make sure this says 'supabaseClient.channel'
    arenaChannel = supabaseClient.channel('battle_room_1', {
        config: {
            presence: { key: mySessionId },
        },
    });

    arenaChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = arenaChannel.presenceState();
            const playersOnline = Object.keys(newState).length;
            
            if (playersOnline > 1) {
                // Read opponent profile data
                for (let id in newState) {
                    if (id !== mySessionId) {
                        const oppData = newState[id][0];
                        document.getElementById('opp-name-display').textContent = oppData.nickname || "Opponent";
                        document.getElementById('opp-avatar-display').textContent = oppData.avatar || "🤖";
                        
                        oppStatusEl.textContent = "Ready to battle!";
                        oppStatusEl.style.color = "#4ade80"; 
                    }
                }
            } else {
                oppStatusEl.textContent = "Waiting for opponent...";
                oppStatusEl.style.color = "#facc15"; 
            }
        })
        .on('broadcast', { event: 'correct_answer' }, (payload) => {
            if (payload.winner !== mySessionId) {
                inputEl.disabled = true;
                oppStatusEl.textContent = "Opponent answered first! ⚡";
                oppStatusEl.style.color = "#ef4444";
                
                updateScore('p2');
                
                setTimeout(() => {
                    loadQuestion(nextQuestion);
                    oppStatusEl.textContent = "Calculating...";
                    oppStatusEl.style.color = "#94a3b8";
                }, 2000);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await arenaChannel.track({
                    nickname: myNickname,
                    avatar: myAvatar
                });
            }
        });

    loadQuestion(sample1D5R);
}

// --- 5. GAME UI LOGIC ---
function loadQuestion(numbersArray) {
    gridEl.innerHTML = ''; 
    currentAnswer = 0;
    inputEl.disabled = false; 

    numbersArray.forEach((num, index) => {
        currentAnswer += num;
        const row = document.createElement('div');
        let displayStr = (num > 0 && index !== 0) ? `+${num}` : num.toString();
        row.textContent = displayStr;
        gridEl.appendChild(row);
    });

    inputEl.value = ''; 
    inputEl.focus();
}

function submitAnswer() {
    const userAnswer = parseInt(inputEl.value, 10);
    if (isNaN(userAnswer)) return;

    if (userAnswer === currentAnswer) {
        // We won the race!
        inputEl.disabled = true; 
        inputEl.style.backgroundColor = '#4ade80'; 
        
        updateScore('p1');

        // Broadcast victory
        arenaChannel.send({
            type: 'broadcast',
            event: 'correct_answer',
            payload: { winner: mySessionId }
        });

        setTimeout(() => {
            inputEl.style.backgroundColor = 'white';
            loadQuestion(nextQuestion); 
        }, 1500);

    } else {
        // Wrong Answer Penalty
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

// Listen for "Enter" key
inputEl.addEventListener("keypress", function(event) {
  if (event.key === "Enter" && !inputEl.disabled) {
    event.preventDefault();
    submitAnswer();
  }
});
