const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;
const VIDEOS_DIR = process.env.VIDEOS_DIR || '/videos';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Check if ffmpeg is available
let ffmpegAvailable = false;
try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    ffmpegAvailable = true;
    console.log('ffmpeg is available on system path.');
} catch (err) {
    console.warn('WARNING: ffmpeg is not found on path. On-the-fly transcoding will not be available. Streaming will fall back to direct file streaming.');
}

// LOST Series Metadata
const SERIES_INFO = {
    title: "LOST",
    creator: "J. J. Abrams, Damon Lindelof, Jeffrey Lieber",
    genres: ["Mystery", "Sci-Fi", "Adventure", "Drama"],
    rating: "TV-14",
    releaseYear: "2004 - 2010",
    description: "The survivors of Oceanic Flight 815 are stranded on a mysterious tropical island. Together, they must fight for survival, confront their dark pasts, and face the island's unexplained supernatural phenomena.",
    seasonsInfo: {
        1: "Introduces the plane crash survivors as they struggle to survive and discover the island's initial mysteries, including a hidden metal hatch and the terrifying 'Others'.",
        2: "Focuses on the discovery of the hatch and the Dharma Initiative, along with the escalating conflict with the mysterious island inhabitants.",
        3: "Explores the society of 'the Others', their captivity of key survivors, and the desperate attempts to contact a rescue ship.",
        4: "Details the arrival of a mysterious freighter sent by Charles Widmore and the flash-forwards showing characters who successfully escaped.",
        5: "Heavily features time-travel mechanics shifting survivors through the island's history while those who left plan a rescue mission to return.",
        6: "The final season concludes the overarching island mythology, alternating between a fight against the smoke monster and an alternate timeline ('flash-sideways')."
    }
};

const EPISODE_TITLES = {
    1: [
        "Pilot (Part 1)", "Pilot (Part 2)", "Tabula Rasa", "Walkabout", "White Rabbit",
        "House of the Rising Sun", "The Moth", "Confidence Man", "Solitary", "Raised by Another",
        "All the Best Cowboys Have Daddy Issues", "Whatever the Case May Be", "Hearts and Minds", "Special", "Homecoming",
        "Outlaws", "...In Translation", "Numbers", "Deus ex Machina", "Do No Harm",
        "The Greater Good", "Born to Run", "Exodus (Part 1)", "Exodus (Part 2)", "Exodus (Part 3)"
    ],
    2: [
        "Man of Science, Man of Faith", "Adrift", "Orientation", "Everybody Hates Hugo", "...And Found",
        "Abandoned", "The Other 48 Days", "Collision", "What Kate Did", "The 23rd Psalm",
        "The Hunting Party", "Fire + Water", "The Long Con", "One of Them", "Maternity Leave",
        "The Whole Truth", "Lockdown", "Dave", "S.O.S.", "Two for the Road",
        "?", "Three Minutes", "Live Together, Die Alone (Part 1)", "Live Together, Die Alone (Part 2)"
    ],
    3: [
        "A Tale of Two Cities", "The Glass Ballerina", "Further Instructions", "Every Man for Himself", "The Cost of Living",
        "I Do", "Not in Portland", "Flashes Before Your Eyes", "Stranger in a Strange Land", "Tricia Tanaka Is Dead",
        "Enter 77", "Par Avion", "The Man from Tallahassee", "Exposé", "Left Behind",
        "One of Us", "Catch-22", "D.O.C.", "The Brig", "The Man Behind the Curtain",
        "Greatest Hits", "Through the Looking Glass (Part 1)", "Through the Looking Glass (Part 2)"
    ],
    4: [
        "The Beginning of the End", "Confirmed Dead", "The Economist", "Eggtown", "The Constant",
        "The Other Woman", "Ji Yeon", "Meet Kevin Johnson", "The Shape of Things to Come", "Something Nice Back Home",
        "Cabin Fever", "There's No Place Like Home (Part 1)", "There's No Place Like Home (Part 2)", "There's No Place Like Home (Part 3)"
    ],
    5: [
        "Because You Left", "The Lie", "Jughead", "The Little Prince", "This Place Is Death",
        "316", "The Life and Death of Jeremy Bentham", "LaFleur", "Namaste", "He's Our You",
        "Whatever Happened, Happened", "Dead Is Dead", "Some Like It Hoth", "The Variable", "Follow the Leader",
        "The Incident (Part 1)", "The Incident (Part 2)"
    ],
    6: [
        "LA X (Part 1)", "LA X (Part 2)", "What Kate Does", "The Substitute", "Lighthouse",
        "Sundown", "Dr. Linus", "Recon", "Ab Aeterno", "The Package",
        "Happily Ever After", "Everybody Loves Hugo", "The Last Recruit", "The Candidate", "Across the Sea",
        "What They Died For", "The End (Part 1)", "The End (Part 2)"
    ]
};

// Video Catalog
let catalog = {};

function scanVideos() {
    catalog = {};
    if (!fs.existsSync(VIDEOS_DIR)) {
        console.warn(`Videos directory not found at ${VIDEOS_DIR}. Please check docker volume mapping.`);
        return;
    }

    try {
        const seasons = fs.readdirSync(VIDEOS_DIR);
        seasons.forEach(seasonName => {
            const seasonPath = path.join(VIDEOS_DIR, seasonName);
            if (!fs.statSync(seasonPath).isDirectory()) return;

            // Extract season number from directory name (e.g. "Season 1")
            const seasonMatch = seasonName.match(/Season\s+(\d+)/i);
            if (!seasonMatch) return;

            const seasonNum = parseInt(seasonMatch[1], 10);
            catalog[seasonNum] = {};

            const files = fs.readdirSync(seasonPath);
            files.forEach(fileName => {
                // Ignore hidden files
                if (fileName.startsWith('.')) return;

                const filePath = path.join(seasonPath, fileName);
                if (fs.statSync(filePath).isDirectory()) return;

                // Match S01E01 or S01-E01 or S01_E01
                const epMatch = fileName.match(/s(\d+)\D*e(\d+)/i);
                if (!epMatch) return;

                const epNum = parseInt(epMatch[2], 10);
                
                // Get pre-defined title or fallback to dynamic
                const seasonList = EPISODE_TITLES[seasonNum];
                const title = (seasonList && seasonList[epNum - 1]) ? seasonList[epNum - 1] : `Episode ${epNum}`;

                catalog[seasonNum][epNum] = {
                    fileName: fileName,
                    filePath: filePath,
                    title: title,
                    size: fs.statSync(filePath).size
                };
            });
        });
        console.log('Scanned video catalog:', Object.keys(catalog).map(s => `Season ${s}: ${Object.keys(catalog[s]).length} episodes`));
    } catch (err) {
        console.error('Error scanning video directory:', err);
    }
}

// Perform initial directory scan
scanVideos();

// Re-scan catalog when requesting homepage/catalog
app.use((req, res, next) => {
    // Re-scan periodically or on catalog request if empty
    if (Object.keys(catalog).length === 0) {
        scanVideos();
    }
    next();
});

// Authentication middleware
const authMiddleware = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (token === 'sathaam-session-token') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// API: Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'sathaam' && password === '1234') {
        res.cookie('auth_token', 'sathaam-session-token', { 
            httpOnly: true, 
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });
        return res.json({ success: true, username: 'sathaam' });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});

// API: Logout Route
app.post('/api/logout', (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.json({ success: true });
});

// API: Check Session Status
app.get('/api/auth/status', (req, res) => {
    const token = req.cookies.auth_token;
    if (token === 'sathaam-session-token') {
        res.json({ authenticated: true, username: 'sathaam' });
    } else {
        res.json({ authenticated: false });
    }
});

// API: Get Series Catalog & Info
app.get('/api/catalog', authMiddleware, (req, res) => {
    // Format catalog data for the client
    const catalogData = {};
    Object.keys(catalog).forEach(seasonNum => {
        catalogData[seasonNum] = [];
        Object.keys(catalog[seasonNum]).forEach(epNum => {
            const ep = catalog[seasonNum][epNum];
            catalogData[seasonNum].push({
                episodeNumber: parseInt(epNum, 10),
                title: ep.title,
                size: ep.size,
                description: `LOST Season ${seasonNum}, Episode ${epNum}: ${ep.title}. Oceanic Flight 815 survivors continue to unravel the island's mysterious properties.`
            });
        });
        // Sort episodes numerically
        catalogData[seasonNum].sort((a, b) => a.episodeNumber - b.episodeNumber);
    });

    res.json({
        series: SERIES_INFO,
        catalog: catalogData,
        ffmpegAvailable: ffmpegAvailable
    });
});

// API: Video stream (direct range requests)
app.get('/api/stream/direct/:season/:episode', authMiddleware, (req, res) => {
    const season = parseInt(req.params.season, 10);
    const episode = parseInt(req.params.episode, 10);

    if (!catalog[season] || !catalog[season][episode]) {
        return res.status(404).send('Episode not found');
    }

    const videoPath = catalog[season][episode].filePath;
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video file does not exist on host filesystem');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/x-matroska',
        };

        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/x-matroska',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
});

// API: Video stream (on-the-fly transcoding using ffmpeg)
app.get('/api/stream/transcode/:season/:episode', authMiddleware, (req, res) => {
    const season = parseInt(req.params.season, 10);
    const episode = parseInt(req.params.episode, 10);

    if (!catalog[season] || !catalog[season][episode]) {
        return res.status(404).send('Episode not found');
    }

    const videoPath = catalog[season][episode].filePath;
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video file does not exist on host filesystem');
    }

    if (!ffmpegAvailable) {
        console.warn('ffmpeg not available, falling back to direct stream.');
        return res.redirect(`/api/stream/direct/${season}/${episode}`);
    }

    const start = req.query.start ? parseFloat(req.query.start) : 0;

    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive'
    });

    const ffmpegArgs = [];

    // Seek input before loading file for quick seek behavior
    if (start > 0) {
        ffmpegArgs.push('-ss', start.toString());
    }

    ffmpegArgs.push(
        '-i', videoPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '22',
        '-maxrate', '3M',
        '-bufsize', '6M',
        '-c:a', 'aac',
        '-ac', '2',
        '-b:a', '128k',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
    );

    console.log(`Starting transcoding process for LOST Season ${season} Episode ${episode} (Seeking to: ${start}s)`);
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data) => {
        // Suppress massive ffmpeg stats logging, but log critical errors
        const message = data.toString();
        if (message.includes('Error') || message.includes('Fatal')) {
            console.error(`ffmpeg stderr: ${message.trim()}`);
        }
    });

    // Cleanup process on client disconnect
    req.on('close', () => {
        console.log(`Client disconnected from LOST Season ${season} Episode ${episode} stream. Killing ffmpeg...`);
        ffmpegProcess.kill('SIGKILL');
    });

    ffmpegProcess.on('error', (err) => {
        console.error('Failed to start ffmpeg process:', err);
    });
});

// Fallback all non-API routes to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Netflix-clone App listening on http://localhost:${PORT}`);
    console.log(`Scanning path for media: ${VIDEOS_DIR}`);
});
