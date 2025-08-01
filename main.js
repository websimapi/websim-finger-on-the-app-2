const LIVES = 3;
const GRACE_PERIOD_MS = 5000;

const desktopBlocker = document.getElementById('desktop-blocker');
const playersList = document.getElementById('players-list');
const touchArea = document.getElementById('touch-area');
const instructions = document.getElementById('instructions');
const gameOverScreen = document.getElementById('game-over-screen');
const finalTimeEl = document.getElementById('final-time');

let room;
let lifeCheckInterval;
let timeUpdateInterval;

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderPlayers() {
    if (!room || !room.presence || !room.peers) return;

    const presence = room.presence;
    const sortedPlayerIds = Object.keys(presence).sort((a, b) => {
        const playerA = presence[a];
        const playerB = presence[b];
        if (playerA.isGameOver && !playerB.isGameOver) return 1;
        if (!playerA.isGameOver && playerB.isGameOver) return -1;
        return (playerB.totalElapsedTime || 0) - (playerA.totalElapsedTime || 0);
    });

    playersList.innerHTML = '';

    for (const clientId of sortedPlayerIds) {
        const playerData = presence[clientId];
        const peerInfo = room.peers[clientId];
        if (!peerInfo) continue;

        const card = document.createElement('div');
        card.className = 'player-card';
        card.classList.toggle('active', playerData.active);
        card.classList.toggle('game-over', playerData.isGameOver);

        const pfp = document.createElement('img');
        pfp.src = peerInfo.avatarUrl;
        pfp.alt = peerInfo.username;

        const username = document.createElement('div');
        username.className = 'username';
        username.textContent = peerInfo.username;

        const livesContainer = document.createElement('div');
        livesContainer.className = 'lives';
        for (let i = 0; i < playerData.lives; i++) {
            const heart = document.createElement('img');
            heart.src = './heart-icon.png';
            heart.alt = 'life';
            livesContainer.appendChild(heart);
        }

        let currentElapsedTime = playerData.totalElapsedTime;
        if (playerData.active && playerData.currentStartTime) {
            currentElapsedTime += Date.now() - playerData.currentStartTime;
        }

        const timer = document.createElement('div');
        timer.className = 'timer';
        timer.textContent = formatTime(currentElapsedTime);

        card.appendChild(pfp);
        card.appendChild(username);
        card.appendChild(livesContainer);
        card.appendChild(timer);

        playersList.appendChild(card);
    }
}

function handleTouchStart() {
    const myPresence = room.presence[room.clientId];
    if (myPresence.isGameOver) return;

    touchArea.classList.add('active');
    instructions.style.display = 'none';

    clearInterval(lifeCheckInterval);
    lifeCheckInterval = null;

    room.updatePresence({
        active: true,
        currentStartTime: Date.now(),
    });
}

function handleTouchEnd() {
    const myPresence = room.presence[room.clientId];
    if (myPresence.isGameOver) return;

    touchArea.classList.remove('active');

    const elapsed = Date.now() - myPresence.currentStartTime;
    
    room.updatePresence({
        active: false,
        currentStartTime: null,
        totalElapsedTime: myPresence.totalElapsedTime + elapsed,
        lastInactiveTime: Date.now(),
    });

    if (!lifeCheckInterval) {
        lifeCheckInterval = setInterval(checkInactive, 1000);
    }
}

function checkInactive() {
    const myPresence = room.presence[room.clientId];
    if (!myPresence || myPresence.active || myPresence.isGameOver) {
        clearInterval(lifeCheckInterval);
        lifeCheckInterval = null;
        return;
    }

    if (Date.now() - myPresence.lastInactiveTime > GRACE_PERIOD_MS) {
        const newLives = myPresence.lives - 1;
        
        if (newLives <= 0) {
            room.updatePresence({ lives: 0, isGameOver: true, lastInactiveTime: Date.now() });
            endGame();
            clearInterval(lifeCheckInterval);
            lifeCheckInterval = null;
        } else {
            room.updatePresence({ lives: newLives, lastInactiveTime: Date.now() });
        }
    }
}

function endGame() {
    const myPresence = room.presence[room.clientId];
    touchArea.classList.remove('active');
    instructions.style.display = 'none';
    gameOverScreen.style.display = 'block';
    finalTimeEl.textContent = formatTime(myPresence.totalElapsedTime);
}

async function main() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
        desktopBlocker.style.display = 'flex';
        return;
    }
    
    room = new WebsimSocket();
    await room.initialize();
    
    const myInitialPresence = {
        lives: LIVES,
        active: false,
        totalElapsedTime: 0,
        currentStartTime: null,
        isGameOver: false,
        lastInactiveTime: null,
    };
    room.updatePresence(myInitialPresence);

    room.subscribePresence((presence) => {
        renderPlayers();
        const myPresence = presence[room.clientId];
        if (myPresence && myPresence.isGameOver) {
            endGame();
        }
    });

    touchArea.addEventListener('touchstart', handleTouchStart, { passive: true });
    touchArea.addEventListener('touchend', handleTouchEnd, { passive: true });
    touchArea.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    // Fallback for if touch is dragged off screen
    document.body.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.body.addEventListener('touchcancel', handleTouchEnd, { passive: true });


    timeUpdateInterval = setInterval(renderPlayers, 250);
}

main();

