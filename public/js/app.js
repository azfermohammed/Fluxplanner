// --- Core App Logic & "Anti-Storage" Schedule Processing ---

// 1. Initial State & Configuration
const physics_g = 10; // IB Physics standard (m/s^2) for AI calculations
let ephemeralImageData = null; // Temporary container for schedule analysis

// 2. Initialize App & Nav
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializeNavigation();
    checkAuth();
    loadTab('dashboard');
});

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            loadTab(tabName);
            updateActiveNav(tabName);
        });
    });
}

// 3. School Info & Schedule Processing (Ephemeral Data)
async function initializeScheduleUploader() {
    const uploadZone = document.querySelector('.upload-zone');
    const fileInput = document.getElementById('schedule-upload');
    const statusText = document.getElementById('upload-status');

    if (!uploadZone || !fileInput) return;

    uploadZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            statusText.innerText = "Error: Please upload a valid image file.";
            return;
        }

        // --- THE EPHEMERAL PROCESS START ---
        statusText.innerText = "AI is reading your schedule... (Image will not be saved)";
        
        try {
            // A. Convert to Base64 (Local memory only)
            ephemeralImageData = await toBase64(file);
            
            // B. Send to Gemini Proxy for analysis
            const extractedSchedule = await analyzeScheduleWithGemini(ephemeralImageData);
            
            if (extractedSchedule) {
                // C. Populated UI
                populateSchedule(extractedSchedule);
                statusText.innerText = "Schedule processed. Image discarded.";
            } else {
                statusText.innerText = "AI couldn't parse the image. Try a clearer photo.";
            }

        } catch (error) {
            console.error("Schedule Analysis Error:", error);
            statusText.innerText = "Error analyzing schedule.";
        } finally {
            // D. CRITICAL CLEANUP: Discard temporary data immediately
            ephemeralImageData = null; 
            fileInput.value = ''; // Clear file input
        }
        // --- THE EPHEMERAL PROCESS END ---
    });
}

// Utility: Convert File to Base64 String
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Return only base64 data
        reader.onerror = error => reject(error);
    });
}

// 4. Tab Loading & Content (Simplified)
function loadTab(tabName) {
    const contentArea = document.getElementById('tab-content');
    const titleArea = document.getElementById('current-tab-title');

    switch (tabName) {
        case 'dashboard':
            titleArea.innerText = "Dashboard";
            contentArea.innerHTML = `<h3>Welcome Back</h3><p>Your overview goes here.</p>`;
            break;
        case 'school-info':
            titleArea.innerText = "School Info";
            contentArea.innerHTML = `
                <div class="school-hub">
                    <div class="upload-section">
                        <h4>Smart Schedule Upload</h4>
                        <div class="upload-zone">
                            <i data-lucide="upload-cloud"></i>
                            <p>Click to Upload Schedule Image</p>
                            <span class="privacy-note">Privacy: Images are processed in real-time and <strong>never saved</strong> to our servers.</span>
                            <input type="file" id="schedule-upload" accept="image/*" hidden>
                        </div>
                        <p id="upload-status" class="status-text"></p>
                    </div>
                    <div class="schedule-display" id="schedule-list">
                        </div>
                </div>`;
            lucide.createIcons();
            initializeScheduleUploader(); // Activate uploader
            break;
        case 'grades':
            titleArea.innerText = "Grades";
            contentArea.innerHTML = `<p>Grade tracking (4-decimal precision) active.</p>`;
            break;
        // Add other cases as needed...
        default:
            contentArea.innerHTML = `<p>Tab content for ${tabName} loading...</p>`;
    }
}

// --- Placeholder Auth/Sync (Requires your Supabase Config) ---
function checkAuth() { console.log("Checking Supabase Auth..."); }
async function analyzeScheduleWithGemini(base64) { 
    console.log("Sending ephemeral data to Gemini Proxy..."); 
    // This calls your /api/gemini-proxy Supabase function
    return null; // Replace with actual fetch call
}
function populateSchedule(data) { console.log("Populating schedule UI:", data); }
function updateActiveNav(tab) { /* UI update logic */ }
