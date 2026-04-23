// --- 1. SUPABASE INITIALIZATION ---
const supabaseUrl = 'https://portal-bridge.ucmas-ambernath-pg.workers.dev';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let mySessionId = null;
let arenaChannel = null;

// --- 2. GAME STATE ---
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

// Sample Data (Later fetch this from your questions_bank table)
const sample1D5R = [5, -2, 4, -1, 3];
const nextQuestion = [8, -5, 2, -1, 4]; // Dummy next question

// --- 3. SUPABASE AUTH & REALTIME LOGIC ---
async function initBattle() {
    // 1. Sign in anonymously (No login required for students)
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
        console.error("Auth Error:", authError);
        return;
    }
    mySessionId = authData.user.id;
    console.log("Logged in anonymously with ID:", mySessionId);

    // 2. Join the shared Battle Arena Channel
    arenaChannel = supabase.channel('battle_room_1', {
        config: {
            presence: { key: mySessionId },
        },
    });

    arenaChannel
        // Listen for who is online (Presence)
        .on('presence', { event: 'sync' }, () => {
            const newState = arenaChannel.presenceState();
            const playersOnline = Object.keys(newState).length;
            
            if (playersOnline > 1) {
                oppStatusEl.textContent = "Opponent is ready!";
                oppStatusEl.style.color = "#4ade80"; // Green
            } else {
                oppStatusEl.textContent = "Waiting for opponent...";
                oppStatusEl.style.color = "#facc15"; // Yellow
            }
        })
        // Listen for the "Fastest Finger" Broadcast
        .on('broadcast', { event: 'correct_answer' }, (payload) => {
            // If the broadcast came from the opponent
            if (payload.winner !== mySessionId) {
                inputEl.disabled = true; // Lock our input!
                oppStatusEl.textContent = "Opponent answered first! ⚡";
                oppStatusEl.style.color = "#ef4444"; // Red
                
                updateScore('p2'); // Give opponent points
                
                // Load next question after a short delay
                setTimeout(() => {
                    loadQuestion(nextQuestion);
                    oppStatusEl.textContent = "Calculating...";
                    oppStatusEl.style.color = "#94a3b8";
                }, 2000);
            }
        })
        .subscribe();

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
