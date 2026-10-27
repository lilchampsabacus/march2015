/* gamify.js - The "Brain" of Li'l Champs */

// ==================================================
// PART 1: CONFIGURATION (KEYS MUST BE AT THE TOP)
// ==================================================

const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
// NOTE: This ANON key is safe to be public as long as Row Level Security (RLS)
// is enabled on the Supabase backend. It should NOT be a service_role key.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";
let supabaseClient;

// ==================================================
// PART 2: INITIALIZATION LOGIC
// ==================================================

function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("✅ Supabase Connected");
    }
}

if (typeof supabase === 'undefined') {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.onload = () => initSupabase();
    document.head.appendChild(script);
} else {
    initSupabase();
}

// ==================================================
// PART 3: SOUNDS & UTILS
// ==================================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
}

function triggerWinConfetti() {
    window.lilChampsOptional.withConfetti(confetti => {
        confetti({ origin: { x: 0, y: 0.7 }, angle: 60, spread: 55, colors: ['#4f46e5', '#ff7e67'] });
        confetti({ origin: { x: 1, y: 0.7 }, angle: 120, spread: 55, colors: ['#4f46e5', '#ff7e67'] });
    });
}

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>&"']/g, function (m) {
        switch (m) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&#39;';
        }
    });
}

// ==================================================
// PART 4: THE SAVE ENGINE (NOW WITH OFFLINE SYNC SUPPORT)
// ==================================================

async function saveExamResult(data, isBackgroundSync = false) {
    console.log(isBackgroundSync ? "🚀 Background Syncing..." : "🚀 Saving...", data);

    if (!supabaseClient && window.supabase) initSupabase();
    if (!supabaseClient) {
        if (!isBackgroundSync) alert("Database connecting... Please wait and try again.");
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        if (!isBackgroundSync) alert("⚠️ Not Logged In!");
        return;
    }

    let studentName = sessionStorage.getItem('studentIdentifier') || session.user.email.split('@')[0];
    studentName = sanitizeString(studentName); 

    // Score Verification Logic
    let numericScore;
    let totalScore;
    let mistakes = data.mistakes || [];
    let accuracyStr = data.accuracy;

    const isVerificationDataProvided = data.questions && Array.isArray(data.questions);

    if (isVerificationDataProvided) {
        let calculatedScore = 0;
        let verifiedMistakes = [];
        data.questions.forEach((q, index) => {
            let correctVal;
            if (q.type === 'mul' || !q.type) { correctVal = q.x * q.y; } 
            else if (q.type === 'div') { correctVal = q.quotient; } 
            else if (q.type === 'addition') { correctVal = q.numbers.reduce((a, b) => a + b, 0); }

            let studentVal = (data.answers && Array.isArray(data.answers)) ? data.answers[index] : null;

            if (studentVal !== null && studentVal !== undefined && Number(studentVal) === correctVal) {
                calculatedScore++;
            } else if (studentVal !== null && studentVal !== "") {
                 verifiedMistakes.push({
                    question: q.type === 'addition' ? q.numbers.join(' + ') : `${q.x} ${q.type === 'div' ? '÷' : '×'} ${q.y}`,
                    wrong: studentVal,
                    correct: correctVal
                });
            }
        });
        numericScore = calculatedScore;
        totalScore = data.questions.length;
        mistakes = verifiedMistakes;
        accuracyStr = Math.round((numericScore / totalScore) * 100) + "%";
    } else {
        numericScore = typeof data.score === 'string' ? parseInt(data.score) : data.score;
        totalScore = data.total;
    }

    const indianTime = data.offlineTimestamp || new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short"
    });

    try {
        // WRAP THE NETWORK CALL TO PREVENT "FAILED TO FETCH" CRASHES
        const { data: reportData, error } = await supabaseClient
            .from('reports')
            .insert({
                user_id: session.user.id,
                student_name: studentName,
                challenge_type: data.challenge,
                score_text: `${numericScore}/${totalScore}`,
                score_val: numericScore,
                total_val: totalScore,
                time_taken: data.time,
                accuracy: accuracyStr,
                mistakes_summary: mistakes ? mistakes.map(m => m.question).join(', ') : "",
                indian_time: indianTime
            })
            .select()
            .single();

        if (error) throw error; 

        if (mistakes && mistakes.length > 0) {
            const mistakeRows = mistakes.map(m => ({
                report_id: reportData.id,
                question: m.question,
                wrong_answer: sanitizeString(String(m.wrong)), 
                correct_answer: String(m.correct)
            }));
            await supabaseClient.from('mistakes').insert(mistakeRows);
        }

        console.log("✅ Saved!");
        if (!isBackgroundSync) {
            triggerWinConfetti();
            alert("✅ Report Saved Successfully!");
        }
    } catch (err) {
        console.error("Critical Save Failure:", err);
        // Throwing the error allows mission pages to trigger the Retry UI
        throw err; 
    }
}
window.lilChampUtils = {
    playCorrect: () => playSound('correct'),
    playWrong: () => playSound('wrong'),
    celebrate: triggerWinConfetti,
    saveResult: saveExamResult
};

// ==================================================
// PART 5: GLOBAL OFFLINE SYNC MANAGER
// ==================================================

async function syncOfflineResultsGlobally() {
    // 1. Check if we have internet and if there is a queue
    if (!navigator.onLine) return;
    let queue = JSON.parse(localStorage.getItem('offlineResultsQueue') || '[]');
    
    if (queue.length > 0) {
        console.log(`🔄 Found ${queue.length} offline reports. Syncing to Supabase...`);
        
        // 2. Wait 2 seconds to ensure Supabase login session is fully established
        setTimeout(async () => {
            for (let i = 0; i < queue.length; i++) {
                const payload = queue[i];
                // 3. Save silently in the background (true flag stops alerts/confetti)
                await saveExamResult(payload, true); 
            }
            
            // 4. Clear the queue so we don't upload duplicates tomorrow
            localStorage.removeItem('offlineResultsQueue');
            console.log("✅ All offline results successfully synced to headquarters!");
        }, 2000); 
    }
}

// 5. Trigger this automatically in two scenarios:
// Scenario A: Internet reconnects while they are staring at the page
window.addEventListener('online', syncOfflineResultsGlobally);

// Scenario B: They open the website (index.html) after being offline
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncOfflineResultsGlobally);
} else {
    syncOfflineResultsGlobally();
}

// ==================================================
// PART 6: MATH GENERATOR ENGINE
// ==================================================

window.generateQuestions = function(code, countParam) {
    console.log("Generating questions for:", code);
    var questions = [];
    var uniqueKeys = {};
    var defaultCount = 30;

    if (code.startsWith('add-') || code.startsWith('dec-') || code.startsWith('neg-')) {
        defaultCount = 20;
    }

    var COUNT = countParam ? parseInt(countParam) : defaultCount;
    var maxTries = COUNT * 50;
    var tries = 0;

    // --- A. SPECIAL ZERO DIVISION (NEW FEATURE) ---
    if (code.startsWith('special-div-')) {
        while (questions.length < COUNT && tries < maxTries) {
            tries++;
            var q = generateSpecialZeroDivision(code);
            // Key is Dividend-Divisor to ensure unique problems
            var key = q.x + "-" + q.y;
            if (!uniqueKeys[key] && q.quotient.toString().includes('0')) {
                uniqueKeys[key] = true;
                questions.push(q);
            }
        }
    }
    // --- B. NEGATIVE SUMS ---
    else if (code.startsWith('neg-')) {
        var digits = 2; var rows = 10;
        if (code.indexOf('1d') > -1) digits = 1;
        if (code.indexOf('2d') > -1) digits = 2;
        if (code.indexOf('3d') > -1) digits = 3;
        if (code.indexOf('4d') > -1) digits = 4;
        if (code.indexOf('5d') > -1) digits = 5;

        while (questions.length < COUNT && tries < maxTries) {
            tries++;
            var nums = generateNegativeSum(digits, rows);
            var key = nums.join(",");
            if (!uniqueKeys[key]) {
                uniqueKeys[key] = true;
                questions.push({ numbers: nums, type: 'addition' });
            }
        }
        while (questions.length < COUNT) {
            questions.push({ numbers: generateNegativeSum(digits, rows), type: 'addition' });
        }
    }
    // --- C. DECIMALS ---
    else if (code.startsWith('dec-')) {
        while (questions.length < COUNT && tries < maxTries) {
            tries++;
            var nums = generateDecimalSum(code);
            var key = nums.join("|");
            if (!uniqueKeys[key]) {
                uniqueKeys[key] = true;
                questions.push({ numbers: nums, type: 'addition' });
            }
        }
        while (questions.length < COUNT) {
            questions.push({ numbers: generateDecimalSum(code), type: 'addition' });
        }
    }
    // --- D. STANDARD ADD/SUB ---
    else if (code.startsWith('add-')) {
        var digits = 1; var rows = 10;
        if (code.indexOf('1d') > -1) digits = 1;
        if (code.indexOf('2d') > -1) digits = 2;
        if (code.indexOf('3d') > -1) digits = 3;
        if (code.indexOf('4d') > -1) digits = 4;
        if (code.indexOf('5d') > -1) digits = 5;

        while (questions.length < COUNT && tries < maxTries) {
            tries++;
            var nums = generateAdditionSum(digits, rows);
            var key = nums.join(",");
            if (!uniqueKeys[key]) { uniqueKeys[key] = true; questions.push({ numbers: nums, type: 'addition' }); }
        }
        while (questions.length < COUNT) { questions.push({ numbers: generateAdditionSum(digits, rows), type: 'addition' }); }
    }
    // --- E. MULTIPLICATION / STANDARD DIVISION ---
    else {
        while (questions.length < COUNT && tries < maxTries) {
            tries++;
            var q = generateMathQuestion(code);
            var key = q.type + "-" + q.x + "-" + q.y;
            if (!uniqueKeys[key]) { uniqueKeys[key] = true; questions.push(q); }
        }
        while (questions.length < COUNT) { questions.push(generateMathQuestion(code)); }
    }

    // Fill remaining if unique check was too strict
    while (questions.length < COUNT) {
         if (code.startsWith('special-div-')) {
             questions.push(generateSpecialZeroDivision(code));
         } else if (code.startsWith('neg-') || code.startsWith('add-') || code.startsWith('dec-')) {
             // Fallbacks for addition are handled above inside loops,
             // typically we just duplicate last valid one if desperate
             questions.push(questions[0] || {numbers:[1,1], type:'addition'});
         } else {
             questions.push(generateMathQuestion(code));
         }
    }

    return questions;
};


// --- HELPER FUNCTIONS ---

function generateSpecialZeroDivision(code) {
    // 1. Define Digit Counts based on Code
    var divDigits = 1; // Divisor Digits (y)
    var dividendDigits = 3; // Dividend Digits (x)

    if (code === 'special-div-3d1d') { dividendDigits = 3; divDigits = 1; }
    else if (code === 'special-div-4d1d') { dividendDigits = 4; divDigits = 1; }
    else if (code === 'special-div-5d1d') { dividendDigits = 5; divDigits = 1; }
    else if (code === 'special-div-4d2d') { dividendDigits = 4; divDigits = 2; }
    else if (code === 'special-div-5d2d') { dividendDigits = 5; divDigits = 2; }
    else if (code === 'special-div-4d3d') { dividendDigits = 4; divDigits = 3; } // Note: Usually quotient is small here
    else if (code === 'special-div-5d3d') { dividendDigits = 5; divDigits = 3; }

    // 2. Generate Divisor (y)
    var minY = Math.pow(10, divDigits - 1);
    var maxY = Math.pow(10, divDigits) - 1;
    // Avoid divisor 1 if possible, unless 1d
    if (minY === 1) minY = 2;

    var y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    // 3. Determine Quotient Range to ensure Dividend has correct # of digits
    // Min Dividend = 100... (dividendDigits)
    // Max Dividend = 999... (dividendDigits)
    var minDividend = Math.pow(10, dividendDigits - 1);
    var maxDividend = Math.pow(10, dividendDigits) - 1;

    var minQ = Math.ceil(minDividend / y);
    var maxQ = Math.floor(maxDividend / y);

    // Safety: if maxQ < minQ, parameters are impossible (e.g., 4d / 3d might not allow large quotients)
    if (maxQ < minQ) maxQ = minQ;

    // 4. Generate a Quotient (q) that MUST contain '0'
    var q;
    var foundZero = false;
    var attempts = 0;

    while (!foundZero && attempts < 100) {
        q = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;
        if (q.toString().indexOf('0') !== -1) {
            foundZero = true;
        }
        attempts++;
    }

    // Fallback if random fails (force a zero)
    if (!foundZero) {
        // Construct a number manually? Or just pick a known pattern like 10...
        // Simple fallback: Multiply by 10 or 100 if fits
        q = minQ;
        if (q.toString().indexOf('0') === -1) {
             // Force a zero in the string if length > 1
             var s = q.toString();
             if (s.length > 1) {
                 s = s.substring(0, 1) + '0' + s.substring(2);
                 q = parseInt(s);
             } else {
                 q = 10; // Basic fallback
             }
        }
    }

    // 5. Calculate Dividend (x)
    var x = q * y;

    return { x: x, y: y, quotient: q, type: 'div' };
}

function generateNegativeSum(digits, rows) {
    var min = digits === 1 ? 1 : Math.pow(10, digits - 1);
    var max = Math.pow(10, digits) - 1;
    var borrow = Math.pow(10, digits); // 10, 100, 1000 ...
    var nums, runningSum, isValid;

    for (var attempt = 0; attempt < 300; attempt++) {
        nums = [];
        runningSum = 0;

        // Phase 1: 2 to (rows-3) positive numbers — build up a positive sum < max
        var phase1Rows = 2 + Math.floor(Math.random() * Math.max(1, rows - 4));

        for (var i = 0; i < phase1Rows; i++) {
            var n = Math.floor(Math.random() * (max - min + 1)) + min;
            nums.push(n);
            runningSum += n;
        }

        // Phase 1 sum must be in [1, max] so one negative number can push it below 0
        if (runningSum < 1 || runningSum > max) continue;

        // Borrow row: one negative number with magnitude in [runningSum+1, max]
        // This is the ONLY time sum crosses zero
        var negMin = runningSum + 1;
        var negMax = max;
        if (negMin > negMax) continue;

        var mag = negMin + Math.floor(Math.random() * (negMax - negMin + 1));
        nums.push(-mag);
        runningSum -= mag; // now negative, in range [-(max), -1]

        // Phase 2: remaining rows keep sum strictly in (-borrow, 0) — never back to >= 0
        var remaining = rows - phase1Rows - 1;
        var ok = true;

        for (var j = 0; j < remaining; j++) {
            var found = false, n2;
            for (var t = 0; t < 50; t++) {
                if (Math.random() > 0.4) {
                    // Positive: must not push sum back to >= 0
                    var maxPos = Math.min(max, -runningSum - 1);
                    if (maxPos >= min) {
                        n2 = min + Math.floor(Math.random() * (maxPos - min + 1));
                        found = true; break;
                    }
                } else {
                    // Negative: must not push sum below -borrow
                    var maxNeg = Math.min(max, borrow + runningSum - 1);
                    if (maxNeg >= min) {
                        n2 = -(min + Math.floor(Math.random() * (maxNeg - min + 1)));
                        found = true; break;
                    }
                }
            }
            if (!found) { ok = false; break; }
            nums.push(n2);
            runningSum += n2;
        }

        // Valid: sum is negative and above -borrow (single borrow confirmed)
        if (ok && runningSum < 0 && runningSum > -borrow) {
            isValid = true;
            break;
        }
    }

    return nums;
}

function generateDecimalSum(code) {
    var minGen, maxGen, minStart, maxStart;
    if (code === 'dec-2d10r') { minGen = 10; maxGen = 99; minStart = 55; maxStart = 99; }
    else if (code === 'dec-3d10r') { minGen = 100; maxGen = 999; minStart = 555; maxStart = 999; }
    else if (code === 'dec-4d10r') { minGen = 1000; maxGen = 9999; minStart = 5555; maxStart = 9999; }
    else { minGen = 10; maxGen = 99; minStart = 55; maxStart = 99; }
    var nums = [];
    var isValid = false;
    while (!isValid) {
        nums = [];
        var runningSum = 0;
        for (var i = 0; i < 10; i++) {
            var n = 0;
            if (i === 0 || i === 1) { n = Math.floor(Math.random() * (maxStart - minStart + 1)) + minStart; }
            else { n = Math.floor(Math.random() * (maxGen - minGen + 1)) + minGen; }
            if (i === 2 || i === 5 || i === 8) { n = -n; }
            nums.push(n);
            runningSum += n;
        }
        if (runningSum >= 0) { isValid = true; }
    }
    return nums.map(function(num) { return parseFloat((num / 100).toFixed(2)); });
}

function generateAdditionSum(digits, rows) {
    var nums = [];
    var sum = 0;
    
    // Positions that must be POSITIVE: 0,1,3,4,6,7,9 (rows 1,2,4,5,7,8,10)
    var mustBePositive = [0, 1, 3, 4, 6, 7, 9];
    // Positions that must be NEGATIVE: 2,5,8 (rows 3,6,9)
    var mustBeNegative = [2, 5, 8];
    
    for (var i = 0; i < rows; i++) {
        var n;
        
        if (mustBePositive.indexOf(i) !== -1) {
            // Always positive
            var min, max;
            if (i === 0 || i === 1) {
                // First two numbers: special range (upper half)
                if (digits === 1) {
                    min = 5;
                    max = 9;
                } else {
                    var baseMin = Math.pow(10, digits - 1);
                    var baseMax = Math.pow(10, digits) - 1;
                    min = Math.floor((baseMin + baseMax) / 2);
                    max = baseMax;
                }
            } else {
                // Other positive positions: normal range
                min = digits === 1 ? 1 : Math.pow(10, digits - 1);
                max = Math.pow(10, digits) - 1;
            }
            n = Math.floor(Math.random() * (max - min + 1)) + min;
        } else if (mustBeNegative.indexOf(i) !== -1) {
            // Always negative (rows 3, 6, 9)
            min = digits === 1 ? 1 : Math.pow(10, digits - 1);
            max = Math.pow(10, digits) - 1;
            n = Math.floor(Math.random() * (max - min + 1)) + min;
            n = -n;
            
            // Safety check: ensure sum doesn't go below 0
            var attempts = 0;
            while (sum + n < 0 && attempts < 100) {
                n = Math.floor(Math.random() * (max - min + 1)) + min;
                n = -n;
                attempts++;
            }
            // If still negative after 100 attempts, use minimum negative that keeps sum >= 0
            if (sum + n < 0) {
                n = -Math.min(sum, max);
            }
        }
        
        nums.push(n);
        sum += n;
    }
    return nums;
}

function generateMathQuestion(code) {
    var xD=[1,1], yD=[1,1], type='mul';
    var minVal = 2;
    if (code === 'mul-1x1') { xD=[1,1]; yD=[1,1]; }
    else if (code === 'mul-2x1') { xD=[2,2]; yD=[1,1]; }
    else if (code === 'mul-3x1') { xD=[3,3]; yD=[1,1]; }
    else if (code === 'mul-4x1') { xD=[4,4]; yD=[1,1]; }
    else if (code === 'mul-2x2') { xD=[2,2]; yD=[2,2]; }
    else if (code === 'mul-3x2') { xD=[3,3]; yD=[2,2]; }
    else if (code === 'mul-4x2') { xD=[4,4]; yD=[2,2]; }
    else if (code === 'mul-5x1') { xD=[5,5]; yD=[1,1]; }
    else if (code.startsWith('div-')) {
        type = 'div';
        yD=[1,1]; xD=[3,3];
        if (code === 'div-3d1d') { xD=[3,3]; yD=[1,1]; }
        else if (code === 'div-4d1d') { xD=[4,4]; yD=[1,1]; }
        else if (code === 'div-5d1d') { xD=[5,5]; yD=[1,1]; }
        else if (code === 'div-4d2d') { xD=[4,4]; yD=[2,2]; }
        else if (code === 'div-4d3d') { xD=[4,4]; yD=[3,3]; }
        else if (code === 'div-5d2d') { xD=[5,5]; yD=[2,2]; }
        else if (code === 'div-5d3d') { xD=[5,5]; yD=[3,3]; }
    }
    var x, y, q;
    if (type === 'mul') {
        x = getRand(xD, minVal);
        y = getRand(yD, minVal);
        if(y > x) { var t=x; x=y; y=t; }
        return { x: x, y: y, type: 'mul' };
    } else {
        y = getRand(yD, 2);
        var minDividend = Math.pow(10, xD[0]-1);
        var maxDividend = Math.pow(10, xD[1])-1;
        var minQ = Math.ceil(minDividend / y);
        var maxQ = Math.floor(maxDividend / y);
        if (maxQ < minQ) { q = minQ; }
        else { q = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ; }
        x = q * y;
        return { x: x, y: y, quotient: q, type: 'div' };
    }
}

const POWERS_OF_10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000];

function getRand(r, minOverride) {
    var pMin = r[0]-1;
    var min = (Number.isInteger(pMin) && pMin >= 0 && pMin < POWERS_OF_10.length) ? POWERS_OF_10[pMin] : Math.pow(10, pMin);

    if (minOverride && minOverride > min) min = minOverride;

    var pMax = r[1];
    var maxVal = (Number.isInteger(pMax) && pMax >= 0 && pMax < POWERS_OF_10.length) ? POWERS_OF_10[pMax] : Math.pow(10, pMax);
    var max = maxVal - 1;

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================================================
// PART 7: FORMULA HINT SYSTEM (TRAFFIC LIGHT)
// ==================================================

window.calculateFormulaHints = function(numbers) {
    let rodStates = Array(10).fill(0); // [Units, Tens, Hundreds, ...]
    let allHints = [];

    for (let num of numbers) {
        let val = Math.abs(num);
        let sign = Math.sign(num);

        // Split into digits (Left to Right)
        let digits = val.toString().split('').map(Number);

        let rowHints = [];

        // Process each digit (Left to Right)
        for (let i = 0; i < digits.length; i++) {
            // Map digit index to rod index. Assumes last digit is Units (Rod 0).
            let rodIndex = digits.length - 1 - i;

            let digitVal = digits[i];
            let digitMove = digitVal * sign; // Apply sign to the digit value

            // Ensure rodState exists
            if (rodStates[rodIndex] === undefined) rodStates[rodIndex] = 0;

            let currentRodVal = rodStates[rodIndex];

            // Get Color
            let color = getMoveColor(currentRodVal, digitMove);
            rowHints.push(color);

            // Update State (Basic Move)
            rodStates[rodIndex] = (currentRodVal + digitMove) % 10;
            // Javascript modulo fix
            if (rodStates[rodIndex] < 0) rodStates[rodIndex] += 10;

            // HANDLE CARRY/BORROW
            // In Left-to-Right logic, we process higher rods first.
            // If the current rod (lower) triggers a carry, it updates the rod to the LEFT (rodIndex + 1).
            // That rod has already been processed for this number, but updating it maintains the correct global state.
            if (color === 'red' || color === 'purple') {
                let nextRod = rodIndex + 1;
                if (rodStates[nextRod] === undefined) rodStates[nextRod] = 0;

                if (sign > 0) {
                     rodStates[nextRod]++;
                } else {
                     rodStates[nextRod]--;
                }
            }

            // NORMALIZE RODS (Ripple Leftwards)
            let checkIndex = rodIndex + 1;
            while (checkIndex < rodStates.length && (rodStates[checkIndex] > 9 || rodStates[checkIndex] < 0)) {
                if (rodStates[checkIndex] > 9) {
                    rodStates[checkIndex] -= 10;
                    if (rodStates[checkIndex + 1] === undefined) rodStates[checkIndex + 1] = 0;
                    rodStates[checkIndex + 1]++;
                } else if (rodStates[checkIndex] < 0) {
                    rodStates[checkIndex] += 10;
                    if (rodStates[checkIndex + 1] === undefined) rodStates[checkIndex + 1] = 0;
                    rodStates[checkIndex + 1]--;
                }
                checkIndex++;
            }
        }

        allHints.push(rowHints); // Pushed in Left-to-Right order
    }

    return allHints;
};

function getMoveColor(currentVal, move) {
    let m = Math.abs(move);
    let sign = Math.sign(move);
    if (move === 0) return 'green'; // No move

    let lower = currentVal % 5;
    let upper = Math.floor(currentVal / 5); // 0 or 1

    if (sign > 0) {
        // --- ADDITION ---

        // 1. Direct Move (Green)
        // If m < 5: Simply add to lower beads
        if (m < 5) {
            if (lower + m <= 4) return 'green';
        }
        // If m >= 5: Need Upper Bead available (0) AND space for remainder in lower
        else {
            if (upper === 0 && lower + (m - 5) <= 4) return 'green';
        }

        // 2. Small Friend (Yellow) - Only for 1, 2, 3, 4
        // Formula: +m = +5 - (5-m)
        // Requirements: Upper bead available (0) AND Lower beads have enough to subtract (5-m)
        if (m < 5) {
            if (upper === 0 && lower >= (5 - m)) return 'yellow';
        }

        // 3. Big Friend (Red) - For 1..9
        // Formula: +m = - (10-m) + 10
        // Requirements: Can we SUBTRACT the complement (10-m) directly from current rod?
        let comp = 10 - m;
        let canSubComp = false;
        if (comp < 5) {
            if (lower >= comp) canSubComp = true;
        } else {
            if (upper === 1 && lower >= (comp - 5)) canSubComp = true;
        }
        if (canSubComp) return 'red';

        // 4. Combination (Purple) - For 6, 7, 8, 9
        // Formula: +m = + (m-5) - 5 + 10
        // Requirements: Need to subtract 5 (Upper=1) AND Add (m-5) (Space in Lower)
        if (m >= 6) {
            let diff = m - 5;
            if (upper === 1 && lower + diff <= 4) return 'purple';
        }

    } else {
        // --- SUBTRACTION ---

        // 1. Direct Move (Green)
        if (m < 5) {
            if (lower >= m) return 'green';
        } else {
            if (upper === 1 && lower >= (m - 5)) return 'green';
        }

        // 2. Small Friend (Yellow) - Only for 1, 2, 3, 4
        // Formula: -m = + (5-m) - 5
        // Requirements: Upper bead set (1) AND Space in Lower to add (5-m)
        if (m < 5) {
            if (upper === 1 && lower + (5 - m) <= 4) return 'yellow';
        }

        // 3. Big Friend (Red) - For 1..9
        // Formula: -m = + (10-m) - 10
        // Requirements: Can we ADD the complement (10-m) directly to current rod?
        let comp = 10 - m;
        let canAddComp = false;
        if (comp < 5) {
            // Explicit constraints as per Abacus logic (User Refactor Request)
            // Add 1: Possible if lower < 4 (Beads 0,1,2,3 -> can become 1,2,3,4)
            // Add 2: Possible ONLY if lower < 3 (Beads 0,1,2 -> can become 2,3,4)
            // Add 3: Possible ONLY if lower < 2 (Beads 0,1 -> can become 3,4)
            // Add 4: Possible ONLY if lower < 1 (Bead 0 -> can become 4)
            if (comp === 1 && lower < 4) canAddComp = true;
            else if (comp === 2 && lower < 3) canAddComp = true;
            else if (comp === 3 && lower < 2) canAddComp = true;
            else if (comp === 4 && lower < 1) canAddComp = true;
            // Otherwise, cannot add complement using lower beads.
        } else {
            if (upper === 0 && lower + (comp - 5) <= 4) canAddComp = true;
        }
        if (canAddComp) return 'red';

        // 4. Combination (Purple) - For 6, 7, 8, 9
        // Formula: -m = - (m-5) + 5 - 10
        // Requirements: Need to Add 5 (Upper=0) AND Subtract (m-5) (Lower has beads)
        let diff = m - 5;
        if (m >= 6) {
             if (upper === 0 && lower >= diff) return 'purple';
        }
    }

    return 'gray'; // Should not happen in standard 10-complement abacus logic if valid
}

// ==================================================
// PART 8: UNIVERSAL CUSTOM KEYPAD LOGIC
// ==================================================

window.handleKeypadInput = function(val) {
    const input = document.getElementById('answer-input');
    if (input) {
        input.value += val;
        // Trigger input event manually so any listeners react
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

window.handleBackspace = function() {
    const input = document.getElementById('answer-input');
    if (input && input.value.length > 0) {
        input.value = input.value.slice(0, -1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

window.handleKeypadEnter = function() {
    // Check if submitAndNext exists (it's defined in the game HTML)
    if (typeof window.submitAndNext === 'function') {
        window.submitAndNext();
    } else {
        console.warn("submitAndNext function not found");
    }
};

window.setupUniversalKeypad = function() {
    // Physical Keyboard Support
    document.addEventListener('keydown', (e) => {
        // Ignore if focus is on another input (like a text field, though mainly answer-input is used)
        // But since we want to REPLACE the keyboard, we might want to capture everything
        // unless the user is explicitly interacting with something else like a student name input?
        // The student name input is readonly in 2D20R.html usually.

        // If the active element is an input or textarea that is NOT the answer-input, we might want to respect it.
        // But the requirement says "Universal Custom Numeric Keypad that replaces the native keyboard".
        // And "Block Native Keyboard: Set the #answer-input HTML attribute to readonly."

        const activeTag = document.activeElement.tagName.toLowerCase();
        const activeId = document.activeElement.id;

        // If we are typing in some other input (unlikely in this app, but good practice), let it be?
        // The prompt implies we want to control the input into #answer-input specifically.
        // "If the user presses physical keys 0-9, ., or -, append them to the input."
        // implying #answer-input.

        // If focus is on answer-input, native behavior is blocked by readonly (mostly).
        // But we want to capture the keys globally.

        const input = document.getElementById('answer-input');
        if (!input) return;

        // Map keys
        const validKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-'];

        if (validKeys.includes(e.key)) {
             // Prevent default only if we are "capturing" it for our input
             // If the user is typing in a different legitimate input, we shouldn't interfere.
             // But here we assume the goal is to drive #answer-input.
             // Let's check if the active element is NOT the answer input and IS editable.
             if (activeTag === 'input' && activeId !== 'answer-input' && !document.activeElement.readOnly) {
                 return;
             }

             handleKeypadInput(e.key);
             e.preventDefault(); // Prevent default behavior (e.g. scrolling or focus change)
        } else if (e.key === 'Backspace') {
             if (activeTag === 'input' && activeId !== 'answer-input' && !document.activeElement.readOnly) {
                 return;
             }
             handleBackspace();
             e.preventDefault();
        } else if (e.key === 'Enter') {
             // If we are on a button, let it click.
             if (activeTag === 'button') return;

             handleKeypadEnter();
             e.preventDefault(); // Prevent form submission if any
        }
    });
};

// Auto-initialize if DOM is ready, or wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.setupUniversalKeypad);
} else {
    window.setupUniversalKeypad();
}
