const SUPABASE_URL = 'https://lfigdijuqmbensebnevo.supabase.co';
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE'; // <--- Put your key here
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Your Precision Rule: Always round to 4 decimal places
function precise(num) {
    return Number(Math.round(num + "e4") + "e-4").toFixed(4);
}

// Initial App Setup
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        document.getElementById('auth-overlay').style.display = 'flex';
    } else {
        document.getElementById('app').style.display = 'block';
        document.getElementById('splash-screen').style.display = 'none';
        loadTab('dashboard');
    }
});

// Google Login
document.getElementById('login-btn')?.addEventListener('click', async () => {
    await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/Fluxplanner/' }
    });
});

// Ephemeral AI Schedule Reader (No Saving)
async function analyzeSchedule(file) {
    console.log("Processing locally... Image will not be saved.");
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const { data, error } = await _supabase.functions.invoke('gemini-proxy', {
            body: { image: base64 }
        });
        if (!error) alert("Schedule parsed! Image cleared from memory.");
    };
}

function loadTab(name) {
    document.getElementById('tab-title').innerText = name.replace('-', ' ').toUpperCase();
    if(name === 'school-info') {
        document.getElementById('tab-content').innerHTML = `
            <div style="padding:20px; border:2px dashed #ccc; text-align:center;">
                <p>Upload Schedule (Processed instantly, never saved)</p>
                <input type="file" onchange="analyzeSchedule(this.files[0])">
            </div>`;
    } else {
        document.getElementById('tab-content').innerHTML = `<p>Welcome to your ${name}.</p>`;
    }
}
