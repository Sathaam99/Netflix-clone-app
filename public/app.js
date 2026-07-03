// --- STATE MANAGEMENT ---
let currentUser = null;
let seriesMetadata = null;
let episodeCatalog = {};
let activeSeason = 1;

// Player State
let currentSeason = 1;
let currentEpisode = 1;
let streamMode = 'transcode'; // 'transcode' or 'direct'
let durationOffset = 0; // Cumulative offset in seconds for transcoded stream seeking
const EPISODE_DURATION = 2580; // Hardcoded standard episode duration (43 minutes) in seconds
let controlsTimeout = null;

// DOM Elements
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const playerContainer = document.getElementById('player-container');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const mainHeader = document.getElementById('main-header');
const logoutBtn = document.getElementById('logout-btn');
const playHeroBtn = document.getElementById('play-hero-btn');
const moreInfoBtn = document.getElementById('more-info-btn');
const seasonTabsContainer = document.getElementById('season-tabs-container');
const seasonDescText = document.getElementById('season-desc-text');
const episodesGridContainer = document.getElementById('episodes-grid-container');

// Player DOM Elements
const video = document.getElementById('video-element');
const playerControlsOverlay = document.querySelector('.player-controls-overlay');
const playerBackBtn = document.getElementById('player-back-btn');
const playerShowTitle = document.getElementById('player-show-title');
const playerEpisodeTitle = document.getElementById('player-episode-title');
const streamModeSelect = document.getElementById('stream-mode-select');
const playerCenterPlay = document.getElementById('player-center-play');
const centerPlayIcon = document.getElementById('center-play-icon');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = playPauseBtn.querySelector('.play-icon');
const pauseIcon = playPauseBtn.querySelector('.pause-icon');
const rewindBtn = document.getElementById('rewind-btn');
const forwardBtn = document.getElementById('forward-btn');
const volumeMuteBtn = document.getElementById('volume-mute-btn');
const volumeUpIcon = volumeMuteBtn.querySelector('.volume-up-icon');
const volumeMutedIcon = volumeMuteBtn.querySelector('.volume-muted-icon');
const volumeSlider = document.getElementById('volume-slider');
const currentTimeText = document.getElementById('current-time-text');
const totalTimeText = document.getElementById('total-time-text');
const nextEpBtn = document.getElementById('next-ep-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenEnterIcon = fullscreenBtn.querySelector('.fullscreen-enter-icon');
const fullscreenExitIcon = fullscreenBtn.querySelector('.fullscreen-exit-icon');
const playerLoadingSpinner = document.getElementById('player-loading-spinner');

// Seeker DOM Elements
const progressContainer = document.querySelector('.progress-container');
const progressBarBg = document.getElementById('progress-bar-bg');
const progressBarBuffered = document.getElementById('progress-bar-buffered');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressHandle = document.getElementById('progress-handle');
const progressTimeTooltip = document.getElementById('progress-time-tooltip');

// --- AUTHENTICATION FLOW ---

// Check Auth Status on Load
async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.authenticated) {
            currentUser = data.username;
            showAppView();
        } else {
            showLoginView();
        }
    } catch (err) {
        console.error('Auth check failed:', err);
        showLoginView();
    }
}

// Show Login Page
function showLoginView() {
    loginContainer.classList.add('active');
    appContainer.classList.remove('active');
    playerContainer.classList.remove('active');
    video.pause();
}

// Show App View
function showAppView() {
    loginContainer.classList.remove('active');
    appContainer.classList.add('active');
    playerContainer.classList.remove('active');
    video.pause();
    document.getElementById('user-display').textContent = currentUser;
    loadCatalog();
}

// Login Handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.username;
            showAppView();
            // Clear inputs
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            alert(data.message || 'Login failed. Please try again.');
        }
    } catch (err) {
        console.error('Error during login:', err);
        alert('An error occurred during login. Is the server running?');
    }
});

// Logout Handler
logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        showLoginView();
    } catch (err) {
        console.error('Logout failed:', err);
    }
});

// --- CATALOG LOAD & RENDER ---

async function loadCatalog() {
    try {
        const res = await fetch('/api/catalog');
        const data = await res.json();
        seriesMetadata = data.series;
        episodeCatalog = data.catalog;

        // Configure Play Hero S1:E1 button status
        if (episodeCatalog && episodeCatalog[1] && episodeCatalog[1].length > 0) {
            playHeroBtn.disabled = false;
        } else {
            playHeroBtn.disabled = true;
            playHeroBtn.textContent = "No episodes scanned";
        }

        renderSeasonTabs();
        selectSeason(activeSeason);
    } catch (err) {
        console.error('Failed to load video catalog:', err);
        episodesGridContainer.innerHTML = `<div class="empty-state">Failed to load video catalog. Please ensure the docker container volume is correctly mapped.</div>`;
    }
}

// Render tabs for scanned seasons
function renderSeasonTabs() {
    seasonTabsContainer.innerHTML = '';
    const seasons = Object.keys(episodeCatalog).map(s => parseInt(s, 10)).sort((a,b) => a - b);
    
    if (seasons.length === 0) {
        seasonTabsContainer.innerHTML = '<span style="color: #666;">No seasons found inside /videos directory</span>';
        seasonDescText.textContent = 'Please make sure you have files like "LOST Season 1/LOST S01-E01...mkv" under the mapped volume.';
        episodesGridContainer.innerHTML = '<div class="empty-state">No episodes discovered. Verify path: /Users/sathaam/Downloads/LOST Series</div>';
        return;
    }

    seasons.forEach(seasonNum => {
        const tab = document.createElement('button');
        tab.className = `season-tab ${seasonNum === activeSeason ? 'active' : ''}`;
        tab.textContent = `Season ${seasonNum}`;
        tab.addEventListener('click', () => selectSeason(seasonNum));
        seasonTabsContainer.appendChild(tab);
    });
}

// Season Selector
function selectSeason(seasonNum) {
    activeSeason = seasonNum;
    
    // Update active tab styling
    const tabs = seasonTabsContainer.querySelectorAll('.season-tab');
    tabs.forEach(tab => {
        if (tab.textContent === `Season ${seasonNum}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update description
    if (seriesMetadata && seriesMetadata.seasonsInfo && seriesMetadata.seasonsInfo[seasonNum]) {
        seasonDescText.textContent = seriesMetadata.seasonsInfo[seasonNum];
    } else {
        seasonDescText.textContent = `Season ${seasonNum} episodes of LOST. Stranded survivors confront the secrets of the island.`;
    }

    // Render episodes
    renderEpisodes(seasonNum);
}

// Render Episode Cards
function renderEpisodes(seasonNum) {
    episodesGridContainer.innerHTML = '';
    const episodes = episodeCatalog[seasonNum] || [];

    if (episodes.length === 0) {
        episodesGridContainer.innerHTML = `<div class="empty-state">No episodes discovered in Season ${seasonNum} directory.</div>`;
        return;
    }

    episodes.forEach(ep => {
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.innerHTML = `
            <div class="episode-thumbnail-placeholder">
                <div class="thumbnail-glow"></div>
                <div class="episode-number">E${ep.episodeNumber}</div>
                <div class="play-hover-overlay">
                    <div class="play-overlay-icon">
                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            </div>
            <div class="episode-info">
                <div>
                    <h3 class="episode-title">${ep.title}</h3>
                    <p class="episode-summary">${ep.description}</p>
                </div>
                <div class="episode-meta">Size: ${(ep.size / (1024 * 1024)).toFixed(1)} MB</div>
            </div>
        `;
        card.addEventListener('click', () => startVideo(seasonNum, ep.episodeNumber));
        episodesGridContainer.appendChild(card);
    });
}

// Header translucency on scroll
window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
        mainHeader.classList.add('scrolled');
    } else {
        mainHeader.classList.remove('scrolled');
    }
});

// Scroll to season selector on More Info click
moreInfoBtn.addEventListener('click', () => {
    document.getElementById('seasons-section').scrollIntoView({ behavior: 'smooth' });
});

// Hero S1:E1 Play Click
playHeroBtn.addEventListener('click', () => {
    if (episodeCatalog && episodeCatalog[1] && episodeCatalog[1].length > 0) {
        startVideo(1, 1);
    }
});


// --- CUSTOM NETFLIX MEDIA PLAYER ---

// Start Playing Video
function startVideo(season, episode) {
    currentSeason = season;
    currentEpisode = episode;
    durationOffset = 0;

    // Get current episode title
    const seasonList = episodeCatalog[season] || [];
    const epObj = seasonList.find(e => e.episodeNumber === episode);
    const title = epObj ? epObj.title : `Episode ${episode}`;

    playerShowTitle.textContent = `LOST - Season ${season}`;
    playerEpisodeTitle.textContent = `Episode ${episode}: ${title}`;

    // Update view
    appContainer.classList.remove('active');
    playerContainer.classList.add('active');

    // Configure Video Source
    configureVideoSrc(0);

    // Reset seeker bar
    updateProgressBar(0);

    // Reset controls visibility
    resetControlsTimer();
}

// Stop Video & Return
function stopVideo() {
    video.pause();
    video.src = '';
    playerContainer.classList.remove('active');
    appContainer.classList.add('active');
}

// Play & Stream config
function configureVideoSrc(startSecs) {
    showSpinner(true);
    durationOffset = startSecs;
    
    // Choose streaming endpoint based on Playback Mode
    let url = '';
    if (streamMode === 'transcode') {
        url = `/api/stream/transcode/${currentSeason}/${currentEpisode}?start=${startSecs}`;
    } else {
        url = `/api/stream/direct/${currentSeason}/${currentEpisode}`;
    }

    video.src = url;
    video.load();
    
    video.play().then(() => {
        // Successful play
        showSpinner(false);
    }).catch(err => {
        console.error('Play request failed:', err);
        showSpinner(false);
    });
}

// Switch stream mode
streamModeSelect.addEventListener('change', (e) => {
    streamMode = e.target.value;
    const currentPlayTime = durationOffset + video.currentTime;
    
    // Direct streaming doesn't support startSecs offset natively, it will restart from 0 unless range seek works.
    const startSeek = streamMode === 'transcode' ? currentPlayTime : 0;
    configureVideoSrc(startSeek);
});

// Play/Pause toggler
function togglePlay() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

// Update UI buttons on status changes
video.addEventListener('play', () => {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    centerPlayIcon.innerHTML = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    resetControlsTimer();
});

video.addEventListener('pause', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    centerPlayIcon.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
    // Keep controls visible on pause
    showControls();
    if (controlsTimeout) clearTimeout(controlsTimeout);
});

playPauseBtn.addEventListener('click', togglePlay);
playerCenterPlay.addEventListener('click', togglePlay);

// Seeker interaction
function seekTo(seconds) {
    if (seconds < 0) seconds = 0;
    if (seconds > EPISODE_DURATION) seconds = EPISODE_DURATION;

    if (streamMode === 'transcode') {
        configureVideoSrc(seconds);
    } else {
        // Direct stream native seek
        video.currentTime = seconds;
    }
}

// Time formatting helper (e.g. 2580 -> 43:00)
function formatTime(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);

    const sStr = s < 10 ? '0' + s : s;
    const mStr = m < 10 && h > 0 ? '0' + m : m;

    if (h > 0) {
        return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
}

// Listen to time updates to refresh timeline bar
video.addEventListener('timeupdate', () => {
    const currentPlayTime = durationOffset + video.currentTime;
    
    // Display current playback time
    currentTimeText.textContent = formatTime(currentPlayTime);
    totalTimeText.textContent = formatTime(EPISODE_DURATION);

    // Update slider bar
    const percentage = Math.min((currentPlayTime / EPISODE_DURATION) * 100, 100);
    updateProgressBar(percentage);

    // Check if video ended (auto-advance)
    if (currentPlayTime >= EPISODE_DURATION) {
        playNextEpisode();
    }
});

// Native ended handler
video.addEventListener('ended', () => {
    playNextEpisode();
});

// Next Episode Trigger
function playNextEpisode() {
    const seasonList = episodeCatalog[currentSeason] || [];
    const nextEp = seasonList.find(e => e.episodeNumber === currentEpisode + 1);

    if (nextEp) {
        // Next episode exists in current season
        startVideo(currentSeason, currentEpisode + 1);
    } else if (episodeCatalog[currentSeason + 1] && episodeCatalog[currentSeason + 1].length > 0) {
        // Move to next season
        startVideo(currentSeason + 1, 1);
    } else {
        // Reached end of entire library
        stopVideo();
        alert('You have reached the end of the LOST series!');
    }
}

nextEpBtn.addEventListener('click', playNextEpisode);

// Update timeline graphics
function updateProgressBar(percentage) {
    progressBarFill.style.width = `${percentage}%`;
    progressHandle.style.left = `${percentage}%`;
}

// Seeker dragging & clicking
progressContainer.addEventListener('click', (e) => {
    const rect = progressBarBg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(clickX / width, 1));
    const seekTime = percentage * EPISODE_DURATION;
    seekTo(seekTime);
});

// Hover tooltip timeline
progressContainer.addEventListener('mousemove', (e) => {
    const rect = progressBarBg.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(hoverX / width, 1));
    const hoverTime = percentage * EPISODE_DURATION;

    progressTimeTooltip.style.left = `${e.clientX - rect.left}px`;
    progressTimeTooltip.style.display = 'block';
    progressTimeTooltip.textContent = formatTime(hoverTime);
});

progressContainer.addEventListener('mouseleave', () => {
    progressTimeTooltip.style.display = 'none';
});

// Rewind / Fast Forward Buttons
rewindBtn.addEventListener('click', () => {
    const currentPlayTime = durationOffset + video.currentTime;
    seekTo(currentPlayTime - 10);
});

forwardBtn.addEventListener('click', () => {
    const currentPlayTime = durationOffset + video.currentTime;
    seekTo(currentPlayTime + 10);
});

// Mute & Volume logic
volumeMuteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    if (video.muted) {
        volumeUpIcon.classList.add('hidden');
        volumeMutedIcon.classList.remove('hidden');
        volumeSlider.value = 0;
    } else {
        volumeUpIcon.classList.remove('hidden');
        volumeMutedIcon.classList.add('hidden');
        volumeSlider.value = video.volume;
    }
});

volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    video.volume = val;
    if (val === 0) {
        video.muted = true;
        volumeUpIcon.classList.add('hidden');
        volumeMutedIcon.classList.remove('hidden');
    } else {
        video.muted = false;
        volumeUpIcon.classList.remove('hidden');
        volumeMutedIcon.classList.add('hidden');
    }
});

// Fullscreen logic
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        playerContainer.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        fullscreenEnterIcon.classList.add('hidden');
        fullscreenExitIcon.classList.remove('hidden');
    } else {
        fullscreenEnterIcon.classList.remove('hidden');
        fullscreenExitIcon.classList.add('hidden');
    }
});

fullscreenBtn.addEventListener('click', toggleFullscreen);
playerBackBtn.addEventListener('click', stopVideo);

// --- KEYBINDING CONTROLS ---
document.addEventListener('keydown', (e) => {
    // Only capture keys if player is active
    if (!playerContainer.classList.contains('active')) return;

    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
    } else if (e.key === 'ArrowLeft') {
        const currentPlayTime = durationOffset + video.currentTime;
        seekTo(currentPlayTime - 10);
    } else if (e.key === 'ArrowRight') {
        const currentPlayTime = durationOffset + video.currentTime;
        seekTo(currentPlayTime + 10);
    } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
    } else if (e.key === 'Escape') {
        stopVideo();
    }
});

// --- HOVER CONTROL VISIBILITY ---

function showControls() {
    playerControlsOverlay.classList.remove('inactive');
}

function hideControls() {
    if (!video.paused) {
        playerControlsOverlay.classList.add('inactive');
    }
}

function resetControlsTimer() {
    showControls();
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 3000);
}

playerContainer.addEventListener('mousemove', resetControlsTimer);

// --- SPINNER ---
function showSpinner(show) {
    if (show) {
        playerLoadingSpinner.classList.remove('hidden');
    } else {
        playerLoadingSpinner.classList.add('hidden');
    }
}

// --- INIT ON LOAD ---
checkAuthStatus();
