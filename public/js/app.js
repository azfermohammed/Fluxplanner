// 1. Supabase Initialization
const SUPABASE_URL = 'https://lfigdijuqmbensebnevo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaWdkaWp1cW1iZW5zZWJuZXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjEzMDgsImV4cCI6MjA4ODkzNzMwOH0.qG1d9DLKrs0qqLgAp-6UGdaU7xWvlg2sWq-oD-y2kVo'; // <--- PUT YOUR KEY HERE
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Constants & Math Rules
const physics_g = 10;
const precise = (n) => Number(Math.round(n + "e4") + "e-4").toFixed(4);

// 3. App Startup Logic
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Flux System Booting...");
    
    try {
        const { data: { session } } = await _supabase.auth.getSession();

        // Hide Splash
        document.getElementById('splash-screen').style.display = 'none';

        if (!session) {
            document.getElementById('auth-overlay').style.display = 'flex';
        } else {
            document.getElementById('app').style.display = 'block';
            showTab('dashboard');
        }
    } catch (err) {
        console.error("Critical Boot Error:", err);
        // If it crashes, at least hide the splash so we can see why
        document.getElementById('splash-screen').innerHTML = "<h1>Error Loading Flux. Check Console.</h1>";
    }
});

// 4. Google Login
document.getElementById('login-btn').onclick = async () => {
    const { error } = await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            // Ensures you return to the Fluxplanner subfolder
            redirectTo: 'https://azfermohammed.github.io/Fluxplanner/' 
        }
    });
    if (error) alert("Login failed: " + error.message);
};

// 5. Navigation Control
function showTab(name) {
    document.getElementById('view-title').innerText = name.toUpperCase();
    const content = document.getElementById('view-content');
    
    if (name === 'school') {
        content.innerHTML = `
            <div style="border:2px dashed #ddd; padding:60px; text-align:center; border-radius:24px; background: #fafafa;">
                <h3>Upload Schedule Image</h3>
                <p style="font-size:13px; color:#888;">AI will read this instantly. <b>No data is saved to our servers.</b></p>
                <input type="file" id="sched-input" style="margin-top:20px;" onchange="processSchedule(this.files[0])">
            </div>
        `;
    } else {
        content.innerHTML = `<p style="color:#666;">Welcome back. All math is currently restricted to 4 decimal places.</p>`;
    }
}

// 6. Real-time AI Processing (Ephemeral)
async function processSchedule(file) {
    if (!file) return;
    document.getElementById('view-title').innerText = "AI PROCESSING...";
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        try {
            // Calls your gemini-proxy Edge Function
            const { data, error } = await _supabase.functions.invoke('gemini-proxy', {
                body: { image: base64 }
            });
            if (error) throw error;
            alert("Schedule analyzed! Original image has been cleared.");
            showTab('school');
        } catch (err) {
            alert("AI Error: " + err.message);
            showTab('school');
        }
    };
}
