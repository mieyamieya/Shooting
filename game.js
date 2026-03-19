const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score-value');
const livesContainer = document.getElementById('lives-container');
const finalScoreElement = document.getElementById('final-score');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const restartBtn = document.getElementById('restart-btn');

// キャンバスサイズ設定
canvas.width = 600;
canvas.height = 800;

// ゲーム状態
let score = 0;
let lives = 3;
let nextExtraLifeScore = 30000;
let isGameOver = false;
let isGameStarted = false;
let animationId;

// UFOタイマー関連
let lastUfoTime = 0;
const ufoInterval = 30000; // 30秒
let ufoDirection = 1; // 1: 左から、-1: 右から
let activeUfo = null;

// オーディオ管理
class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playShot() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playExplosion() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    startUfoSound() {
        if (this.ufoOsc) return;
        this.ufoOsc = this.ctx.createOscillator();
        this.ufoGain = this.ctx.createGain();

        this.ufoOsc.type = 'square';
        // ピコピコ音を作るためのLFO的な周波数変調
        const now = this.ctx.currentTime;
        for (let i = 0; i < 100; i++) {
            this.ufoOsc.frequency.setValueAtTime(800, now + i * 0.1);
            this.ufoOsc.frequency.setValueAtTime(1200, now + i * 0.1 + 0.05);
        }

        this.ufoGain.gain.setValueAtTime(0.05, now);
        
        this.ufoOsc.connect(this.ufoGain);
        this.ufoGain.connect(this.ctx.destination);
        
        this.ufoOsc.start();
    }

    stopUfoSound() {
        if (this.ufoOsc) {
            this.ufoOsc.stop();
            this.ufoOsc.disconnect();
            this.ufoGain.disconnect();
            this.ufoOsc = null;
            this.ufoGain = null;
        }
    }
}

const audio = new AudioController();

// キー状態
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

// クラス定義
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 5;
        this.speedY = (Math.random() - 0.5) * 5;
        this.color = color;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.01;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }
}

class Player {
    constructor() {
        this.width = 40;
        this.height = 30;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - 60;
        this.speed = 7;
        this.color = '#00f2ff';
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }

    update() {
        if (keys.ArrowLeft && this.x > 0) {
            this.x -= this.speed;
        }
        if (keys.ArrowRight && this.x < canvas.width - this.width) {
            this.x += this.speed;
        }
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 15;
        this.speed = 8;
        this.color = '#ff00ea';
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
        ctx.restore();
    }

    update() {
        this.y -= this.speed;
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.color = '#ffffff';
    }

    draw() {
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // シンプルな目のようなデザイン
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x + 8, this.y + 8, 4, 4);
        ctx.fillRect(this.x + 18, this.y + 8, 4, 4);
        ctx.restore();
    }
}

class Ufo {
    constructor(direction) {
        this.width = 50;
        this.height = 20;
        this.direction = direction; // 1 for left-to-right, -1 for right-to-left
        this.y = 50;
        this.speed = 3;
        this.color = '#ff0000';
        
        if (this.direction === 1) {
            this.x = -this.width;
        } else {
            this.x = canvas.width;
        }
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        ctx.fillStyle = this.color;
        // UFOっぽい形（楕円形）
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 窓のようなパーツ
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x + 15, this.y + 5, 5, 5);
        ctx.fillRect(this.x + 30, this.y + 5, 5, 5);
        
        ctx.restore();
    }

    update() {
        this.x += this.direction * this.speed;
    }

    isOffScreen() {
        return (this.direction === 1 && this.x > canvas.width) || (this.direction === -1 && this.x < -this.width);
    }
}

// 初期化
const player = new Player();
const bullets = [];
const enemies = [];
const particles = [];

// UFO関連（上部で定義済みのため削除）

function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function initEnemies() {
    const rows = 5;
    const cols = 8;
    const padding = 20;
    const offsetX = 80;
    const offsetY = 100;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            enemies.push(new Enemy(
                c * (30 + padding) + offsetX,
                r * (30 + padding) + offsetY
            ));
        }
    }
}

let enemyDirection = 1;
let enemyMoveStep = 0.5;

function updateEnemies() {
    let touchedWall = false;
    enemies.forEach(enemy => {
        enemy.x += enemyDirection * enemyMoveStep;
        if (enemy.x <= 0 || enemy.x + enemy.width >= canvas.width) {
            touchedWall = true;
        }
    });

    if (touchedWall) {
        enemyDirection *= -1;
        enemies.forEach(enemy => {
            enemy.y += 20;
            if (enemy.y + enemy.height >= player.y) {
                loseLife();
            }
        });
    }
}

function updateUfo() {
    const now = Date.now();
    
    // UFOが出現していない時かつ時間が経過した時
    if (!activeUfo && now - lastUfoTime > ufoInterval) {
        activeUfo = new Ufo(ufoDirection);
        ufoDirection *= -1; // 次回のために方向を反転
        lastUfoTime = now;
        audio.startUfoSound();
    }

    if (activeUfo) {
        activeUfo.update();
        if (activeUfo.isOffScreen()) {
            activeUfo = null;
            audio.stopUfoSound();
        }
    }
}

function loseLife() {
    lives--;
    updateLivesUI();
    
    if (lives <= 0) {
        gameOver();
    } else {
        // 敵を少し押し戻すか、リセットするか
        // 今回はシンプルに敵を少し上に押し戻し、一時停止なしで継続
        enemies.forEach(enemy => {
            enemy.y -= 100;
        });
        createExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color);
        audio.playExplosion();
    }
}

initEnemies();

function updateUI() {
    scoreElement.textContent = score;
    
    // エクステンド処理
    if (score >= nextExtraLifeScore) {
        lives++;
        nextExtraLifeScore += 30000;
        updateLivesUI();
        // エクステンド音（任意で追加可能だが、一旦爆発音を代用または無音）
    }
}

function updateLivesUI() {
    livesContainer.innerHTML = '';
    for (let i = 0; i < lives; i++) {
        const life = document.createElement('div');
        life.className = 'life-icon';
        livesContainer.appendChild(life);
    }
}

function checkCollisions() {
    // 弾とインベーダーの判定
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const b = bullets[i];
            const e = enemies[j];

            if (
                b.x > e.x &&
                b.x < e.x + e.width &&
                b.y > e.y &&
                b.y < e.y + e.height
            ) {
                createExplosion(e.x + e.width / 2, e.y + e.height / 2, e.color);
                audio.playExplosion();
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score += 100;
                updateUI();
                break;
            }
        }
    }

    // 弾とUFOの判定
    if (activeUfo) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (
                b.x > activeUfo.x &&
                b.x < activeUfo.x + activeUfo.width &&
                b.y > activeUfo.y &&
                b.y < activeUfo.y + activeUfo.height
            ) {
                createExplosion(activeUfo.x + activeUfo.width / 2, activeUfo.y + activeUfo.height / 2, activeUfo.color);
                audio.playExplosion();
                audio.stopUfoSound();
                bullets.splice(i, 1);
                activeUfo = null;
                score += 1000;
                updateUI();
                break;
            }
        }
    }

    if (enemies.length === 0) {
        // 全滅させたら再配置（難易度アップ）
        enemyMoveStep += 0.2;
        initEnemies();
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// メインループ
function gameLoop() {
    if (isGameOver) return;
    
    // クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景効果
    drawStars();
    
    // 更新
    player.update();
    updateBullets();
    updateEnemies();
    updateUfo();
    updateParticles();
    checkCollisions();
    
    // 描画
    player.draw();
    bullets.forEach(b => b.draw());
    enemies.forEach(e => e.draw());
    if (activeUfo) activeUfo.draw();
    particles.forEach(p => p.draw());
    
    animationId = requestAnimationFrame(gameLoop);
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
        }
    }
}

let lastShotTime = 0;
const shotInterval = 300;

function fireBullet() {
    const now = Date.now();
    if (now - lastShotTime > shotInterval) {
        bullets.push(new Bullet(player.x + player.width / 2, player.y));
        audio.playShot();
        lastShotTime = now;
    }
}

// 簡易的な背景演出
const stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2,
    speed: Math.random() * 0.5 + 0.2
}));

function drawStars() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
        star.y += star.speed;
        if (star.y > canvas.height) star.y = 0;
    });
}

// イベントリスナー
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight') keys.ArrowRight = true;
    if (e.code === 'Space') {
        if (!isGameStarted) {
            startGame();
        } else {
            fireBullet();
        }
        keys.Space = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight') keys.ArrowRight = false;
    if (e.code === 'Space') keys.Space = false;
});

function startGame() {
    isGameStarted = true;
    startScreen.classList.add('hidden');
    updateLivesUI();
    lastUfoTime = Date.now(); // 開始時からカウント
    gameLoop();
}

function gameOver() {
    isGameOver = true;
    cancelAnimationFrame(animationId);
    audio.stopUfoSound(); // ゲームオーバー時にUFO音が鳴り続けないように
    finalScoreElement.textContent = score;
    gameOverScreen.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
    location.reload();
});
