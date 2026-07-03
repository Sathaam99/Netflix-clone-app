// --- GLOBAL ERROR TRACKING FOR EASY DEBUGGING ---
window.onerror = function(message, source, lineno, colno, error) {
    const errorDetails = `JavaScript Error: ${message}\nSource: ${source}\nLine: ${lineno}:${colno}\nStack: ${error ? error.stack : 'N/A'}`;
    console.error(errorDetails);
    alert("Netflix Clone Debug Info:\n" + errorDetails);
    return false;
};

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

// DOM Elements (assigned on DOMContentLoaded)
let loginContainer, appContainer, playerContainer;
let loginForm, usernameInput, passwordInput;
let mainHeader, logoutBtn, playHeroBtn, moreInfoBtn;
let seasonTabsContainer, seasonDescText, episodesGridContainer;

// Player DOM Elements
let video, playerControlsOverlay, playerBackBtn, playerShowTitle, playerEpisodeTitle;
let streamModeSelect, playerCenterPlay, centerPlayIcon, playPauseBtn, playIcon, pauseIcon;
let rewindBtn, forwardBtn, volumeMuteBtn, volumeUpIcon, volumeMutedIcon, volumeSlider;
let currentTimeText, totalTimeText, nextEpBtn, fullscreenBtn, fullscreenEnterIcon, fullscreenExitIcon;
let playerLoadingSpinner;

// Seeker DOM Elements
let progressContainer, progressBarBg, progressBarBuffered, progressBarFill, progressHandle, progressTimeTooltip;

// Initialize elements and event listeners when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, initializing elements...');
    
    // Core containers
    loginContainer = document.getElementById('login-container');
    appContainer = document.getElementById('app-container');
    playerContainer = document.getElementById('player-container');
    
    // Login form
    loginForm = document.getElementById('login-form');
    usernameInput = document.getElementById('username');
    passwordInput = document.getElementById('password');
    
    // UI controls
    mainHeader = document.getElementById('main-header');
    logoutBtn = document.getElementById('logout-btn');
    playHeroBtn = document.getElementById('play-hero-btn');
    moreInfoBtn = document.getElementById('more-info-btn');
    seasonTabsContainer = document.getElementById('season-tabs-container');
    seasonDescText = document.getElementById('season-desc-text');
    episodesGridContainer = document.getElementById('episodes-grid-container');
    
    // Video player
    video = document.getElementById('video-element');
    playerControlsOverlay = document.querySelector('.player-controls-overlay');
    playerBackBtn = document.getElementById('player-back-btn');
    playerShowTitle = document.getElementById('player-show-title');
    playerEpisodeTitle = document.getElementById('player-episode-title');
    streamModeSelect = document.getElementById('stream-mode-select');
    playerCenterPlay = document.getElementById('player-center-play');
    centerPlayIcon = document.getElementById('center-play-icon');
    playPauseBtn = document.getElementById('play-pause-btn');
    playIcon = playPauseBtn.querySelector('.play-icon');
    pauseIcon = playPauseBtn.querySelector('.pause-icon');
    
    rewindBtn = document.getElementById('rewind-btn');
    forwardBtn = document.getElementById('forward-btn');
    volumeMuteBtn = document.getElementById('volume-mute-btn');
    volumeUpIcon = volumeMuteBtn.querySelector('.volume-up-icon');
    volumeMutedIcon = volumeMuteBtn.querySelector('.volume-muted-icon');
    volumeSlider = document.getElementById('volume-slider');
    
    currentTimeText = document.getElementById('current-time-text');
    totalTimeText = document.getElementById('total-time-text');
    nextEpBtn = document.getElementById('next-ep-btn');
    fullscreenBtn = document.getElementById('fullscreen-btn');
    fullscreenEnterIcon = fullscreenBtn.querySelector('.fullscreen-enter-icon');
    fullscreenExitIcon = fullscreenBtn.querySelector('.fullscreen-exit-icon');
    playerLoadingSpinner = document.getElementById('player-loading-spinner');
    
    // Seeker timeline
    progressContainer = document.querySelector('.progress-container');
    progressBarBg = document.getElementById('progress-bar-bg');
    progressBarBuffered = document.getElementById('progress-bar-buffered');
    progressBarFill = document.getElementById('progress-bar-fill');
    progressHandle = document.getElementById('progress-handle');
    progressTimeTooltip = document.getElementById('progress-time-tooltip');

    // Register all event listeners
    registerEventListeners();
    
    // Check authentication
    checkAuthStatus();
});

// Register Event Listeners
function registerEventListeners() {
    // Form Submit
    loginForm.addEventListener('submit', handleLogin);
    
    // Logout Button
    logoutBtn.addEventListener('click', handleLogout);
    
    // Header navigation links smooth scroll
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const target = link.getAttribute('data-target');
            if (target === 'home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (target === 'seasons') {
                document.getElementById('seasons-section').scrollIntoView({ behavior: 'smooth' });
            } else if (target === 'about') {
                document.querySelector('.main-footer').scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Hero buttons
    moreInfoBtn.addEventListener('click', () => {
        document.getElementById('seasons-section').scrollIntoView({ behavior: 'smooth' });
    });
    
    playHeroBtn.addEventListener('click', () => {
        if (episodeCatalog && episodeCatalog[1] && episodeCatalog[1].length > 0) {
            startVideo(1, 1);
        }
    });

    // Player Buttons
    playPauseBtn.addEventListener('click', togglePlay);
    playerCenterPlay.addEventListener('click', togglePlay);
    playerBackBtn.addEventListener('click', stopVideo);
    nextEpBtn.addEventListener('click', playNextEpisode);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Seeker timeline clicks/drags
    progressContainer.addEventListener('click', handleSeekClick);
    progressContainer.addEventListener('mousemove', handleSeekTooltip);
    progressContainer.addEventListener('mouseleave', hideSeekTooltip);

    // Skip / Rewind Buttons
    rewindBtn.addEventListener('click', () => seekRelative(-10));
    forwardBtn.addEventListener('click', () => seekRelative(10));

    // Volume controllers
    volumeMuteBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', handleVolumeSlider);

    // Stream playback mode switch
    streamModeSelect.addEventListener('change', (e) => {
        streamMode = e.target.value;
        const currentPlayTime = durationOffset + video.currentTime;
        const startSeek = streamMode === 'transcode' ? currentPlayTime : 0;
        configureVideoSrc(startSeek);
    });

    // Video native triggers
    video.addEventListener('play', onVideoPlay);
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('timeupdate', onVideoTimeUpdate);
    video.addEventListener('ended', onVideoEnded);

    // Header background change on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) {
            mainHeader.classList.add('scrolled');
        } else {
            mainHeader.classList.remove('scrolled');
        }
    });

    // Keyboard controls in player
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Auto-hide controls overlay
    playerContainer.addEventListener('mousemove', resetControlsTimer);
}

// --- AUTHENTICATION FLOW ---

async function checkAuthStatus() {
    try {
        console.log('Checking auth status...');
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.authenticated) {
            currentUser = data.username;
            console.log('Session active for user:', currentUser);
            showAppView();
        } else {
            console.log('No active session. Showing login.');
            showLoginView();
        }
    } catch (err) {
        console.error('Auth status check failed:', err);
        showLoginView();
    }
}

function showLoginView() {
    loginContainer.classList.add('active');
    appContainer.classList.remove('active');
    playerContainer.classList.remove('active');
    if (video) video.pause();
}

function showAppView() {
    loginContainer.classList.remove('active');
    appContainer.classList.add('active');
    playerContainer.classList.remove('active');
    if (video) video.pause();
    document.getElementById('user-display').textContent = currentUser || 'sathaam';
    loadCatalog();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        console.log('Attempting login...');
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.username;
            console.log('Login successful for user:', currentUser);
            showAppView();
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            alert(data.message || 'Login failed. Please check credentials.');
        }
    } catch (err) {
        console.error('Error during login:', err);
        alert('Could not contact authentication server. Verify server is running.');
    }
}

async function handleLogout(e) {
    e.preventDefault();
    try {
        console.log('Logging out...');
        await fetch('/api/logout', { method: 'POST' });
        currentUser = null;
        showLoginView();
    } catch (err) {
        console.error('Logout failed:', err);
    }
}

// --- CATALOG LOAD & RENDER ---

async function loadCatalog() {
    try {
        console.log('Fetching media catalog...');
        const res = await fetch('/api/catalog');
        if (!res.ok) {
            if (res.status === 401) {
                console.warn('Unauthorized catalog load request. Redirecting to login.');
                showLoginView();
                return;
            }
            throw new Error(`Failed to load catalog. Status: ${res.status}`);
        }
        
        const data = await res.json();
        seriesMetadata = data.series || {};
        episodeCatalog = data.catalog || {};

        // Configure Play Hero S1:E1 button
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
        episodesGridContainer.innerHTML = `
            <div class="empty-state">
                <p>Failed to load video catalog.</p>
                <small style="color: #666; margin-top: 10px; display: block;">Error: ${err.message}</small>
                <button class="btn btn-primary" style="margin-top: 15px;" onclick="loadCatalog()">Retry</button>
            </div>`;
    }
}

function renderSeasonTabs() {
    seasonTabsContainer.innerHTML = '';
    
    if (!episodeCatalog) {
        episodeCatalog = {};
    }

    const seasons = Object.keys(episodeCatalog).map(s => parseInt(s, 10)).sort((a,b) => a - b);
    
    if (seasons.length === 0) {
        seasonTabsContainer.innerHTML = '<span style="color: #8c8c8c;">No seasons found in /videos</span>';
        seasonDescText.textContent = 'Ensure files are mapped to /videos in the container.';
        episodesGridContainer.innerHTML = `
            <div class="empty-state">
                <p>No episodes discovered.</p>
                <small style="color: #737373;">Path inside container: /videos</small>
            </div>`;
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

function selectSeason(seasonNum) {
    activeSeason = seasonNum;
    
    const tabs = seasonTabsContainer.querySelectorAll('.season-tab');
    tabs.forEach(tab => {
        if (tab.textContent === `Season ${seasonNum}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    if (seriesMetadata && seriesMetadata.seasonsInfo && seriesMetadata.seasonsInfo[seasonNum]) {
        seasonDescText.textContent = seriesMetadata.seasonsInfo[seasonNum];
    } else {
        seasonDescText.textContent = `Season ${seasonNum} of LOST. stranded survivors continue to investigate the mysteries of the island.`;
    }

    renderEpisodes(seasonNum);
}

function renderEpisodes(seasonNum) {
    episodesGridContainer.innerHTML = '';
    const episodes = episodeCatalog[seasonNum] || [];

    if (episodes.length === 0) {
        episodesGridContainer.innerHTML = `<div class="empty-state">No episodes discovered in Season ${seasonNum} folder.</div>`;
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

// --- VIDEO PLAYER ACTIONS ---

function startVideo(season, episode) {
    currentSeason = season;
    currentEpisode = episode;
    durationOffset = 0;

    const seasonList = episodeCatalog[season] || [];
    const epObj = seasonList.find(e => e.episodeNumber === episode);
    const title = epObj ? epObj.title : `Episode ${episode}`;

    playerShowTitle.textContent = `LOST - Season ${season}`;
    playerEpisodeTitle.textContent = `Episode ${episode}: ${title}`;

    appContainer.classList.remove('active');
    playerContainer.classList.add('active');

    configureVideoSrc(0);
    updateProgressBar(0);
    resetControlsTimer();
}

function stopVideo() {
    video.pause();
    video.src = '';
    playerContainer.classList.remove('active');
    appContainer.classList.add('active');
}

function configureVideoSrc(startSecs) {
    showSpinner(true);
    durationOffset = startSecs;
    
    let url = '';
    if (streamMode === 'transcode') {
        url = `/api/stream/transcode/${currentSeason}/${currentEpisode}?start=${startSecs}`;
    } else {
        url = `/api/stream/direct/${currentSeason}/${currentEpisode}`;
    }

    video.src = url;
    video.load();
    
    video.play().then(() => {
        showSpinner(false);
    }).catch(err => {
        console.error('Video play start failed:', err);
        showSpinner(false);
    });
}

function togglePlay() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function onVideoPlay() {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    centerPlayIcon.innerHTML = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    resetControlsTimer();
}

function onVideoPause() {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    centerPlayIcon.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
    showControls();
    if (controlsTimeout) clearTimeout(controlsTimeout);
}

function seekTo(seconds) {
    if (seconds < 0) seconds = 0;
    if (seconds > EPISODE_DURATION) seconds = EPISODE_DURATION;

    if (streamMode === 'transcode') {
        configureVideoSrc(seconds);
    } else {
        video.currentTime = seconds;
    }
}

function seekRelative(deltaSeconds) {
    const currentPlayTime = durationOffset + video.currentTime;
    seekTo(currentPlayTime + deltaSeconds);
}

function onVideoTimeUpdate() {
    const currentPlayTime = durationOffset + video.currentTime;
    
    currentTimeText.textContent = formatTime(currentPlayTime);
    totalTimeText.textContent = formatTime(EPISODE_DURATION);

    const percentage = Math.min((currentPlayTime / EPISODE_DURATION) * 100, 100);
    updateProgressBar(percentage);

    if (currentPlayTime >= EPISODE_DURATION) {
        playNextEpisode();
    }
}

function onVideoEnded() {
    playNextEpisode();
}

function playNextEpisode() {
    const seasonList = episodeCatalog[currentSeason] || [];
    const nextEp = seasonList.find(e => e.episodeNumber === currentEpisode + 1);

    if (nextEp) {
        startVideo(currentSeason, currentEpisode + 1);
    } else if (episodeCatalog[currentSeason + 1] && episodeCatalog[currentSeason + 1].length > 0) {
        startVideo(currentSeason + 1, 1);
    } else {
        stopVideo();
        alert('Congratulations! You finished the entire scanned catalog of LOST!');
    }
}

function updateProgressBar(percentage) {
    progressBarFill.style.width = `${percentage}%`;
    progressHandle.style.left = `${percentage}%`;
}

function handleSeekClick(e) {
    const rect = progressBarBg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(clickX / width, 1));
    const seekTime = percentage * EPISODE_DURATION;
    seekTo(seekTime);
}

function handleSeekTooltip(e) {
    const rect = progressBarBg.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(hoverX / width, 1));
    const hoverTime = percentage * EPISODE_DURATION;

    progressTimeTooltip.style.left = `${e.clientX - rect.left}px`;
    progressTimeTooltip.style.display = 'block';
    progressTimeTooltip.textContent = formatTime(hoverTime);
}

function hideSeekTooltip() {
    progressTimeTooltip.style.display = 'none';
}

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

function toggleMute() {
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
}

function handleVolumeSlider(e) {
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
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        playerContainer.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
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

function handleKeyboardShortcuts(e) {
    if (!playerContainer.classList.contains('active')) return;

    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
    } else if (e.key === 'ArrowLeft') {
        seekRelative(-10);
    } else if (e.key === 'ArrowRight') {
        seekRelative(10);
    } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
    } else if (e.key === 'Escape') {
        stopVideo();
    }
}

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

function showSpinner(show) {
    if (show) {
        playerLoadingSpinner.classList.remove('hidden');
    } else {
        playerLoadingSpinner.classList.add('hidden');
    }
}
