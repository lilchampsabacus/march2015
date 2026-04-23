// --- 1. SUPABASE INITIALIZATION ---
const supabaseUrl = 'https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let mySessionId = null;
let arenaChannel = null;

// --- 2. PLAYER PROFILE VARIABLES ---
let myNickname = "Player";
let myAvatar = "🥷";

// --- 3. LOBBY LOGIC ---
function selectAvatar(emoji) {
    myAvatar = emoji;
    // Update UI selection
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

    // 1. Update the UI to show the chosen name and avatar
    document.getElementById('my-name-display').textContent = myNickname;
    document.getElementById('my-avatar-display').textContent = myAvatar;

    // 2. Hide Lobby, Show Arena
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('battle-container').style.display = 'flex';

    // 3. NOW boot up Supabase and join the room
    await initBattle();
}

// --- 4. SUPABASE AUTH & REALTIME LOGIC ---
async function initBattle() {
    // Sign in anonymously
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError) return console.error("Auth Error:", authError);
    mySessionId = authData.user.id;

    // Join the shared Battle Arena Channel
    arenaChannel = supabase.channel('battle_room_1', {
        config: {
            presence: { key: mySessionId },
        },
    });

    arenaChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = arenaChannel.presenceState();
            const playersOnline = Object.keys(newState).length;
            
            if (playersOnline > 1) {
                // Find the opponent's data from the presence state
                for (let id in newState) {
                    if (id !== mySessionId) {
                        const oppData = newState[id][0];
                        document.getElementById('opp-name-display').textContent = oppData.nickname || "Opponent";
                        document.getElementById('opp-avatar-display').textContent = oppData.avatar || "🤖";
                        
                        const oppStatusEl = document.getElementById('opp-status');
                        oppStatusEl.textContent = "Ready to battle!";
                        oppStatusEl.style.color = "#4ade80"; // Green
                    }
                }
            }
        })
        .on('broadcast', { event: 'correct_answer' }, (payload) => {
            if (payload.winner !== mySessionId) {
                const inputEl = document.getElementById('answer-input');
                const oppStatusEl = document.getElementById('opp-status');
                
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
            // Once subscribed, broadcast our name and avatar so the opponent can see it
            if (status === 'SUBSCRIBED') {
                await arenaChannel.track({
                    nickname: myNickname,
                    avatar: myAvatar
                });
            }
        });

    // Start the first question
    loadQuestion(sample1D5R);
}

// --- 4. GAME UI LOGIC ---
function loadQuestion(numbersArray) {
    gridEl.innerHTML = ''; 
    currentAnswer = 0;
    inputEl.disabled = false; // Unlock input

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
        // CORRECT! We are the fastest finger.
        inputEl.disabled = true; // Lock input so we don't submit twice
        inputEl.style.backgroundColor = '#4ade80'; // Flash green
        
        updateScore('p1');

        // BROADCAST OUR WIN TO THE ROOM
        arenaChannel.send({
            type: 'broadcast',
            event: 'correct_answer',
            payload: { winner: mySessionId }
        });

        setTimeout(() => {
            inputEl.style.backgroundColor = 'white';
            loadQuestion(nextQuestion); // Load next sum
        }, 1500);

    } else {
        // WRONG ANSWER - Penalty visual
        inputEl.style.backgroundColor = '#fca5a5';
        setTimeout(() => inputEl.style.backgroundColor = 'white', 500);
        inputEl.value = '';
    }
}

function updateScore(winner) {
    if (winner === 'p1') {
        p1Score += 10;
        p1ScoreEl.textContent = p1Score;
        tugPosition += 10; // Pull rope left
    } else {
        p2Score += 10;
        p2ScoreEl.textContent = p2Score;
        tugPosition -= 10; // Pull rope right
    }
    
    // Keep the tug of war bar within bounds
    tugPosition = Math.max(5, Math.min(95, tugPosition));
    tugBarEl.style.width = `${tugPosition}%`;
}

// Press Enter to submit
inputEl.addEventListener("keypress", function(event) {
  if (event.key === "Enter" && !inputEl.disabled) {
    event.preventDefault();
    submitAnswer();
  }
});

// Boot up the game
initBattle();
