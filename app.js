// Variables globales
let currentUser = { name: null, token: null, ctfdUrl: null, permissions: null, teamName: null, id: null };
let challenges = {};
let teams = [];
window.teams = [];
let teamProgress = {};
window.teamProgress = {};
let selectedTeams = [];
window.selectedTeams = [];
let currentViewMode = 'overview';
let isConnected = false;
let userPermissions = { canViewAllTeams: false, canViewFutureChalls: false, isAdmin: false };

// Configuration de debug
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get('debug') === 'true' || 
                     localStorage.getItem('CTFDMAP_DEBUG') === 'true' ||
                     (typeof process !== 'undefined' && process.env && process.env.CTFDMAP_DEBUG === 'true');

// Fonctions de debug conditionnelles
const debugLog = (...args) => DEBUG_ENABLED && debugLog(...args);
const debugWarn = (...args) => DEBUG_ENABLED && debugWarn(...args);
const debugError = (...args) => console.error(...args); // Les erreurs sont toujours affichées

/**
 * Generate distinct colors for teams using golden ratio distribution
 * This ensures maximum visual separation between team colors
 */
function generateDistinctTeamColors(count) {
    const colors = [];
    const goldenRatio = 0.618033988749895;
    let hue = Math.random(); // Start with random hue
    
    // Predefined highly distinct colors for small number of teams
    const predefinedColors = [
        '#ef4444', // Red
        '#10b981', // Green  
        '#3b82f6', // Blue
        '#f59e0b', // Orange
        '#8b5cf6', // Purple
        '#06b6d4', // Cyan
        '#84cc16', // Lime
        '#f97316', // Dark Orange
        '#ec4899', // Pink
        '#14b8a6', // Teal
        '#a855f7', // Violet
        '#f43f5e', // Rose
        '#22c55e', // Emerald
        '#6366f1', // Indigo
        '#eab308', // Yellow
        '#dc2626'  // Dark Red
    ];
    
    // Use predefined colors for small counts
    if (count <= predefinedColors.length) {
        return predefinedColors.slice(0, count);
    }
    
    // For larger counts, use golden ratio distribution
    for (let i = 0; i < count; i++) {
        // Use golden ratio to distribute hues evenly
        hue = (hue + goldenRatio) % 1;
        
        // Vary saturation and lightness for better distinction
        const saturation = 65 + (i % 3) * 10; // 65%, 75%, 85%
        const lightness = 45 + (i % 2) * 10;  // 45%, 55%
        
        colors.push(`hsl(${Math.floor(hue * 360)}, ${saturation}%, ${lightness}%)`);
    }
    
    return colors;
}

// Make the function available globally for other modules
window.generateDistinctTeamColors = generateDistinctTeamColors;
window.getChallengeHeatmapColors = getChallengeHeatmapColors;

/**
 * Show the About modal
 */
function showAboutModal() {
    document.getElementById('about-modal').style.display = 'flex';
}

/**
 * Hide the About modal
 */
function hideAboutModal() {
    document.getElementById('about-modal').style.display = 'none';
}

// Make functions available globally
window.showAboutModal = showAboutModal;
window.hideAboutModal = hideAboutModal;

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const aboutModal = document.getElementById('about-modal');
    if (aboutModal) {
        aboutModal.addEventListener('click', function(e) {
            if (e.target === aboutModal) {
                hideAboutModal();
            }
        });
    }
});

/**
 * Calculate average solve time for each challenge from selected teams
 * Returns object with challengeId -> average time in milliseconds
 */
function calculateChallengeHeatmap() {
    const heatmapData = {};
    
    if (!selectedTeams || selectedTeams.length === 0) {
        return heatmapData;
    }
    
    // Iterate through all challenges
    Object.keys(challengeMap).forEach(challengeId => {
        const solveTimes = [];
        
        // Collect solve times from selected teams
        selectedTeams.forEach(teamName => {
            const teamData = teamProgress[teamName];
            if (teamData && teamData[challengeId] && 
                teamData[challengeId].status === 'solved' && 
                teamData[challengeId].date) {
                
                const solveDate = new Date(teamData[challengeId].date);
                
                // Find previous challenge solve to calculate time difference
                const previousSolve = findPreviousSolveForTeam(teamName, challengeId, solveDate);
                if (previousSolve) {
                    const timeDiff = solveDate - new Date(previousSolve.date);
                    solveTimes.push(timeDiff);
                } else {
                    // For first challenge, use time from CTF start (approximation)
                    // We can use a baseline or skip if no reference point
                    const ctfStart = new Date(solveDate);
                    ctfStart.setHours(ctfStart.getHours() - 1); // Assume 1 hour before first solve
                    solveTimes.push(solveDate - ctfStart);
                }
            }
        });
        
        // Calculate average solve time for this challenge
        if (solveTimes.length > 0) {
            const avgTime = solveTimes.reduce((sum, time) => sum + time, 0) / solveTimes.length;
            heatmapData[challengeId] = {
                averageTime: avgTime,
                solveCount: solveTimes.length,
                times: solveTimes
            };
        }
    });
    
    return heatmapData;
}

/**
 * Convert time to heatmap color (cold to hot scale)
 * @param {number} time - Time in milliseconds
 * @param {number} minTime - Minimum time in dataset
 * @param {number} maxTime - Maximum time in dataset
 * @returns {string} - CSS color value
 */
function getHeatmapColor(time, minTime, maxTime) {
    if (maxTime === minTime) {
        return 'hsl(240, 70%, 65%)'; // Default blue if all times are equal
    }
    
    // Normalize time to 0-1 range
    const normalized = (time - minTime) / (maxTime - minTime);
    
    // Color scale: Blue (cold/fast) -> Green -> Yellow -> Red (hot/slow)
    let hue, saturation, lightness;
    
    if (normalized <= 0.25) {
        // Blue to Cyan (240° to 180°)
        hue = 240 - (normalized * 4) * 60;
        saturation = 70;
        lightness = 65;
    } else if (normalized <= 0.5) {
        // Cyan to Green (180° to 120°)
        hue = 180 - ((normalized - 0.25) * 4) * 60;
        saturation = 70;
        lightness = 60;
    } else if (normalized <= 0.75) {
        // Green to Yellow (120° to 60°)
        hue = 120 - ((normalized - 0.5) * 4) * 60;
        saturation = 75;
        lightness = 55;
    } else {
        // Yellow to Red (60° to 0°)
        hue = 60 - ((normalized - 0.75) * 4) * 60;
        saturation = 80;
        lightness = 50;
    }
    
    return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get heatmap data and colors for all challenges
 */
function getChallengeHeatmapColors() {
    const heatmapData = calculateChallengeHeatmap();
    const times = Object.values(heatmapData).map(d => d.averageTime);
    
    if (times.length === 0) {
        return {};
    }
    
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    const colorMap = {};
    Object.entries(heatmapData).forEach(([challengeId, data]) => {
        colorMap[challengeId] = {
            color: getHeatmapColor(data.averageTime, minTime, maxTime),
            time: data.averageTime,
            normalizedTime: (data.averageTime - minTime) / (maxTime - minTime),
            solveCount: data.solveCount,
            timeFormatted: formatTimeDiffDetailed(data.averageTime)
        };
    });
    
    return colorMap;
}

// Challenge solve times modal
let currentChallengeModal = null;

// D3 system state
let d3SystemReady = false;
let d3InitializationInProgress = false;

// Team cache system
let teamDataCache = {};
let loadingTeams = new Set(); // Track teams currently being loaded

// Challenge attempts cache
let challengeAttemptsCache = {};
window.challengeAttemptsCache = challengeAttemptsCache;

// Team submissions cache (all submissions for a team)
let teamSubmissionsCache = {};
window.teamSubmissionsCache = teamSubmissionsCache;


// Team sorting
let teamSortMode = 'score'; // 'score' or 'name'
let showOnlySelected = false; // Toggle pour n'afficher que les équipes sélectionnées

// Challenge drag & drop variables
let isDraggingChallenge = false;
let draggedChallengeId = null;
let customPositions = {}; // Store custom positions

// Parcours mode
let parcoursMode = false;
window.parcoursMode = false;

// Heatmap mode
let heatmapMode = false;
window.heatmapMode = false;

// Debug mode for dependency troubleshooting

// Helper to sync selectedTeams with window
function setSelectedTeams(newTeams) {
    selectedTeams = newTeams;
    window.selectedTeams = newTeams;
    
    // Sauvegarder dans sessionStorage pour persister après reconnexion
    try {
        sessionStorage.setItem('selectedTeams', JSON.stringify(newTeams));
    } catch (e) {
        debugLog('Impossible de sauvegarder les équipes sélectionnées:', e);
    }
    
    // Update team paths if parcours mode is active
    if (window.parcoursMode && window.updateTeamPaths) {
        // Small delay to ensure DOM is updated
        setTimeout(() => window.updateTeamPaths(), 50);
    }
    
    // Update heatmap if heatmap mode is active
    if (window.heatmapMode && d3SystemReady && window.renderD3Challenges) {
        // Small delay to ensure data is updated
        setTimeout(() => window.renderD3Challenges(), 50);
    }
}

// Helper to sync teams with window
function setTeams(newTeams) {
    teams = newTeams;
    window.teams = newTeams;
}

// Helper to sync teamProgress
function syncTeamProgress() {
    window.teamProgress = teamProgress;
}

// ==================== CHALLENGE SOLVES MODAL ====================

async function showChallengeSolvesModal(challengeId) {
    const challenge = challengeMap[challengeId];
    if (!challenge) return;
    
    // Créer ou récupérer la modale
    let modal = document.getElementById('challenge-solves-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'challenge-solves-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        modal.onclick = (e) => {
            if (e.target === modal) closeChallengeModal();
        };
        document.body.appendChild(modal);
    }
    
    // Créer le contenu de la modale
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: #ffffff;
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        position: relative;
    `;
    
    modalContent.innerHTML = `
        <button onclick="closeChallengeModal()" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
        <h2 style="margin-bottom: 16px; font-size: 20px;">📊 ${challenge.name}</h2>
        <div style="margin-bottom: 20px; color: #6b7280; font-size: 14px;">
            <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 8px;">${challenge.category}</span>
            <span>${challenge.points} points</span>
        </div>
        <div id="solves-loading" style="text-align: center; padding: 40px;">
            <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
            <div>Chargement des résolutions...</div>
        </div>
        <div id="solves-content" style="display: none;"></div>
    `;
    
    modal.innerHTML = '';
    modal.appendChild(modalContent);
    modal.style.display = 'flex';
    
    // Charger les données de résolution
    await loadChallengeSolves(challengeId);
}

async function loadChallengeSolves(challengeId) {
    try {
        const challenge = challengeMap[challengeId];
        debugLog('🔍 loadChallengeSolves:', {
            challengeId,
            challenge,
            isAdmin: userPermissions.isAdmin,
            selectedTeams,
            teamProgressKeys: Object.keys(teamProgress)
        });
        
        // Si on est en mode utilisateur (pas admin), utiliser les données depuis teamProgress
        if (!userPermissions.isAdmin) {
            // Pour un utilisateur normal, afficher uniquement son équipe
            const teamName = currentUser.teamName;
            if (teamName && teamProgress[teamName] && teamProgress[teamName][challengeId]) {
                const solve = teamProgress[teamName][challengeId];
                if (solve.solved === true || solve.status === 'solved') {
                    const team = teams.find(t => t.name === teamName);
                    
                    // Vérifier que la date existe et est valide
                    let solveDate = null;
                    if (solve.date) {
                        solveDate = new Date(solve.date);
                        if (isNaN(solveDate.getTime())) {
                            debugLog(`⚠️ Date invalide pour ${teamName} sur challenge ${challengeId}: ${solve.date}`);
                            solveDate = new Date(); // Utiliser la date actuelle comme fallback
                        }
                    } else {
                        debugLog(`⚠️ Pas de date pour ${teamName} sur challenge ${challengeId}`);
                        solveDate = new Date(); // Utiliser la date actuelle comme fallback
                    }
                    
                    // Calculer le temps relatif depuis le premier solve
                    let relativeTime = null;
                    let relativeTimeStr = '';
                    const firstSolve = findFirstSolveForTeam(teamName);
                    if (firstSolve) {
                        relativeTime = solveDate - new Date(firstSolve.date);
                        relativeTimeStr = formatTimeDiffDetailed(relativeTime);
                    }
                    
                    const solveData = [{
                        team: teamName,
                        teamColor: team ? team.color : '#6b7280',
                        date: solveDate,
                        dateStr: formatDate(solveDate),
                        place: 1,
                        timeDiff: null,
                        timeDiffStr: '',
                        timeFromPrevChall: null,
                        timeFromPrevChallStr: '',
                        relativeTime,
                        relativeTimeStr,
                        attempts: 1
                    }];
                    
                    // Calculer le temps depuis le challenge précédent
                    const prevChallSolve = findPreviousSolveForTeam(teamName, challengeId, solveDate);
                    if (prevChallSolve) {
                        solveData[0].timeFromPrevChall = solveDate - new Date(prevChallSolve.date);
                        solveData[0].timeFromPrevChallStr = formatTimeDiffDetailed(solveData[0].timeFromPrevChall);
                    }
                    
                    displayChallengeSolves(solveData, challengeId);
                    return;
                }
            }
            
            // Pas de solve pour cet utilisateur
            displayChallengeSolves([], challengeId);
            return;
        }
        
        // Mode admin : afficher uniquement les équipes sélectionnées
        const solvesData = [];
        const selectedTeamSolves = [];
        
        debugLog('📊 Mode admin - Recherche des solves pour les équipes sélectionnées');
        
        // Charger les tentatives pour ce challenge (si disponible)
        let challengeAttempts = {};
        try {
            challengeAttempts = await loadChallengeAttempts(challengeId);
        } catch (error) {
            console.error('Erreur chargement tentatives:', error);
            // Continuer sans les tentatives
        }
        
        // Collecter les solves des équipes sélectionnées depuis teamProgress
        for (const teamName of selectedTeams) {
            debugLog(`  Checking team: ${teamName}`, {
                hasTeamProgress: !!teamProgress[teamName],
                hasChallengeProgress: !!(teamProgress[teamName] && teamProgress[teamName][challengeId]),
                challengeData: teamProgress[teamName] ? teamProgress[teamName][challengeId] : null
            });
            
            if (teamProgress[teamName] && teamProgress[teamName][challengeId]) {
                const solve = teamProgress[teamName][challengeId];
                if (solve.solved === true || solve.status === 'solved') {
                    // Vérifier que la date existe et est valide
                    let solveDate = null;
                    if (solve.date) {
                        solveDate = new Date(solve.date);
                        if (isNaN(solveDate.getTime())) {
                            debugLog(`⚠️ Date invalide pour ${teamName}: ${solve.date}`);
                            solveDate = new Date(); // Utiliser la date actuelle comme fallback
                        }
                    } else {
                        debugLog(`⚠️ Pas de date pour ${teamName}`);
                        solveDate = new Date(); // Utiliser la date actuelle comme fallback
                    }
                    
                    selectedTeamSolves.push({
                        teamName,
                        solve,
                        date: solveDate
                    });
                    debugLog(`    ✅ Team ${teamName} solved this challenge`);
                }
            }
        }
        
        // Trier par date
        selectedTeamSolves.sort((a, b) => a.date - b.date);
        
        // Construire les données avec calcul des temps
        selectedTeamSolves.forEach((teamSolve, index) => {
            const team = teams.find(t => t.name === teamSolve.teamName);
            
            // Calculer le temps depuis le solve précédent (parmi les équipes sélectionnées)
            let timeDiff = null;
            let timeDiffStr = '';
            if (index > 0) {
                timeDiff = teamSolve.date - selectedTeamSolves[index - 1].date;
                timeDiffStr = formatTimeDiffDetailed(timeDiff);
            }
            
            // Calculer le temps depuis le challenge précédent pour cette équipe
            let timeFromPrevChall = null;
            let timeFromPrevChallStr = '';
            const prevChallSolve = findPreviousSolveForTeam(teamSolve.teamName, challengeId, teamSolve.date);
            if (prevChallSolve) {
                timeFromPrevChall = teamSolve.date - new Date(prevChallSolve.date);
                timeFromPrevChallStr = formatTimeDiffDetailed(timeFromPrevChall);
            }
            
            // Calculer le temps relatif depuis le premier solve de l'équipe
            let relativeTime = null;
            let relativeTimeStr = '';
            const firstSolve = findFirstSolveForTeam(teamSolve.teamName);
            if (firstSolve) {
                relativeTime = teamSolve.date - new Date(firstSolve.date);
                relativeTimeStr = formatTimeDiffDetailed(relativeTime);
            }
            
            solvesData.push({
                team: teamSolve.teamName,
                teamColor: team ? team.color : '#6b7280',
                date: teamSolve.date,
                dateStr: formatDate(teamSolve.date),
                place: index + 1,
                timeDiff,
                timeDiffStr,
                timeFromPrevChall,
                timeFromPrevChallStr,
                relativeTime,
                relativeTimeStr,
                attempts: (challengeAttempts && challengeAttempts[teamSolve.teamName]) || 1 // Utiliser les vraies tentatives ou 1 par défaut
            });
        });
        
        // Afficher les résultats
        displayChallengeSolves(solvesData, challengeId);
        
    } catch (error) {
        console.error('Erreur chargement solves:', error);
        document.getElementById('solves-loading').innerHTML = `
            <div style="color: #ef4444;">❌ Erreur de chargement</div>
            <div style="font-size: 12px; margin-top: 8px; color: #dc2626;">
                ${error.message || 'Erreur inconnue'}
            </div>
            <div style="font-size: 11px; margin-top: 8px; color: #7f1d1d;">
                Vérifiez la console pour plus de détails
            </div>
        `;
    }
}

function findPreviousSolveForTeam(teamName, currentChallengeId, currentSolveDate) {
    const teamSolves = teamProgress[teamName];
    if (!teamSolves) return null;
    
    // Chercher le solve le plus récent avant la date actuelle (peu importe les dépendances)
    let mostRecentSolve = null;
    let mostRecentDate = null;
    
    for (const [challId, progress] of Object.entries(teamSolves)) {
        // Ignorer le challenge actuel et les non-résolus
        if (challId === currentChallengeId || 
            !(progress.solved === true || progress.status === 'solved')) continue;
        
        if (!progress.date) continue; // Ignorer si pas de date
        
        const solveDate = new Date(progress.date);
        if (isNaN(solveDate.getTime())) continue; // Ignorer si date invalide
        
        // Chercher les solves qui sont avant la date actuelle
        if (solveDate < currentSolveDate) {
            if (!mostRecentDate || solveDate > mostRecentDate) {
                mostRecentSolve = { challengeId: challId, ...progress };
                mostRecentDate = solveDate;
            }
        }
    }
    
    return mostRecentSolve;
}

// Trouver le premier solve d'une équipe (pour calculer le temps relatif)
function findFirstSolveForTeam(teamName) {
    const teamSolves = teamProgress[teamName];
    if (!teamSolves) return null;
    
    let firstSolve = null;
    let firstSolveDate = null;
    
    for (const [challId, progress] of Object.entries(teamSolves)) {
        if ((progress.solved === true || progress.status === 'solved') && progress.date) {
            const solveDate = new Date(progress.date);
            if (isNaN(solveDate.getTime())) continue; // Ignorer si date invalide
            
            if (!firstSolveDate || solveDate < firstSolveDate) {
                firstSolve = { challengeId: challId, ...progress };
                firstSolveDate = solveDate;
            }
        }
    }
    
    return firstSolve;
}

function displayChallengeSolves(solvesData, challengeId) {
    const content = document.getElementById('solves-content');
    const loading = document.getElementById('solves-loading');
    const challenge = challengeMap[challengeId];
    
    if (solvesData.length === 0) {
        loading.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🏳️</div>
                <div style="color: #6b7280; font-size: 16px;">
                    ${userPermissions.isAdmin ? 
                        'Aucune équipe sélectionnée n\'a résolu ce challenge' : 
                        'Votre équipe n\'a pas encore résolu ce challenge'}
                </div>
                ${userPermissions.isAdmin && selectedTeams.length === 0 ? 
                    '<div style="margin-top: 8px; font-size: 14px; color: #9ca3af;">Sélectionnez des équipes dans la sidebar pour voir leurs résolutions</div>' : ''}
            </div>
        `;
        return;
    }
    
    // Statistiques de résolution
    let averageTime = 0;
    if (solvesData.length > 0 && challenge.dependencies.length > 0) {
        const validTimes = solvesData.filter(s => s.timeFromPrevChall).map(s => s.timeFromPrevChall);
        if (validTimes.length > 0) {
            averageTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
        }
    }
    
    content.innerHTML = `
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 16px; font-weight: 600; color: #0369a1;">
                        🏆 ${solvesData.length} résolution${solvesData.length > 1 ? 's' : ''}
                    </div>
                    ${userPermissions.isAdmin ? 
                        `<div style="font-size: 12px; color: #0c4a6e; margin-top: 4px;">
                            Parmi les ${selectedTeams.length} équipe(s) sélectionnée(s)
                        </div>` : ''}
                </div>
                ${averageTime > 0 ? `
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #0c4a6e;">Temps moyen depuis le précédent chall</div>
                        <div style="font-size: 16px; font-weight: 600; color: #0369a1;">${formatTimeDiff(averageTime)}</div>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${solvesData.map((solve, idx) => `
                <div style="background: #f9fafb; 
                           border: 1px solid #e5e7eb; 
                           border-radius: 8px; 
                           padding: 16px;
                           transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                <span style="font-weight: 700; 
                                           font-size: 20px; 
                                           color: #374151;">
                                    #${solve.place}
                                </span>
                                <div style="width: 16px; height: 16px; background: ${solve.teamColor}; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                                <span style="font-weight: 600; font-size: 16px; color: #111827;">${solve.team}</span>
                                ${solve.attempts > 1 ? `
                                    <span style="background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">
                                        ${solve.attempts - 1} fail${solve.attempts > 2 ? 's' : ''}
                                    </span>
                                ` : ''}
                            </div>
                            <div style="font-size: 14px; color: #6b7280;">
                                📅 ${solve.dateStr}
                            </div>
                        </div>
                        <div style="text-align: right; min-width: 160px;">
                            ${solve.relativeTimeStr ? `
                                <div style="background: #f3e8ff; 
                                          border: 1px solid #c084fc;
                                          border-radius: 6px; 
                                          padding: 4px 8px;
                                          margin-bottom: 4px;">
                                    <div style="font-size: 10px; color: #6b21a8; font-weight: 500;">Temps relatif</div>
                                    <div style="font-size: 14px; color: #581c87; font-weight: 600;">${solve.relativeTimeStr}</div>
                                </div>
                            ` : ''}
                            ${solve.timeFromPrevChallStr ? `
                                <div style="background: #dbeafe; 
                                          border: 1px solid #93c5fd;
                                          border-radius: 6px; 
                                          padding: 4px 8px;
                                          margin-bottom: 4px;">
                                    <div style="font-size: 10px; color: #1e40af; font-weight: 500;">Depuis dernier chall</div>
                                    <div style="font-size: 14px; color: #1e3a8a; font-weight: 600;">${solve.timeFromPrevChallStr}</div>
                                </div>
                            ` : ''}
                            ${solve.timeDiffStr && solve.place > 1 ? `
                                <div style="background: #d1fae5; 
                                          border: 1px solid #6ee7b7;
                                          border-radius: 6px; 
                                          padding: 4px 8px;">
                                    <div style="font-size: 10px; color: #047857; font-weight: 500;">Δ équipe préc.</div>
                                    <div style="font-size: 14px; color: #065f46; font-weight: 600;">+${solve.timeDiffStr}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    loading.style.display = 'none';
    content.style.display = 'block';
}

function formatTimeDiff(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Tronquer le texte trop long
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

// Format détaillé pour la modale
function formatTimeDiffDetailed(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);
    
    return parts.join(' ');
}

function formatDate(date) {
    const options = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    return date.toLocaleString('fr-FR', options);
}

function closeChallengeModal() {
    const modal = document.getElementById('challenge-solves-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}


// Charger toutes les submissions d'une équipe ou d'un utilisateur
async function loadTeamSubmissions(teamId) {
    if (teamSubmissionsCache[teamId]) {
        debugLog(`📦 Submissions depuis cache pour team ${teamId}`);
        return teamSubmissionsCache[teamId];
    }
    
    try {
        debugLog(`🔄 Chargement des submissions pour team ${teamId}...`);
        
        let response;
        // Vérifier si c'est un ID utilisateur (mode individuel)
        if (String(teamId).startsWith('user_')) {
            // Mode individuel - utiliser l'endpoint utilisateur
            const userId = teamId.replace('user_', '');
            try {
                // Essayer d'abord l'endpoint fails pour utilisateur
                response = await callCTFdAPI(`/api/v1/users/${userId}/fails?per_page=100`);
            } catch (error) {
                // Si ça échoue, essayer l'endpoint submissions général avec filtre
                debugLog(`Endpoint user fails non disponible, utilisation de submissions...`);
                response = await callCTFdAPI(`/api/v1/submissions?user_id=${userId}&type=incorrect&per_page=100`);
            }
        } else {
            // Mode équipe standard
            response = await callCTFdAPI(`/api/v1/teams/${teamId}/fails?per_page=100`);
        }
        
        if (response && response.data) {
            // Organiser les submissions par challenge
            const submissionsByChallenge = {};
            
            response.data.forEach(submission => {
                const challengeId = submission.challenge_id;
                if (!submissionsByChallenge[challengeId]) {
                    submissionsByChallenge[challengeId] = 0;
                }
                submissionsByChallenge[challengeId]++;
            });
            
            teamSubmissionsCache[teamId] = submissionsByChallenge;
            debugLog(`✅ Submissions chargées pour team ${teamId}:`, submissionsByChallenge);
            return submissionsByChallenge;
        }
    } catch (error) {
        debugWarn(`⚠️ Impossible de charger les submissions pour team ${teamId}:`, error.message);
    }
    
    return {};
}

// Charger les tentatives pour un challenge (submissions incorrectes + correcte)
async function loadChallengeAttempts(challengeId) {
    // Créer une clé de cache qui inclut les équipes sélectionnées
    const selectedTeamsKey = selectedTeams.sort().join(',');
    const cacheKey = `${challengeId}_${selectedTeamsKey}`;
    
    // Vérifier le cache d'abord
    if (challengeAttemptsCache[cacheKey]) {
        debugLog('📊 Tentatives depuis cache:', challengeAttemptsCache[cacheKey]);
        return challengeAttemptsCache[cacheKey];
    }
    
    const attempts = {};
    
    // Utiliser les données de submissions déjà chargées
    for (const teamName of selectedTeams) {
        if (teamProgress[teamName] && 
            teamProgress[teamName][challengeId] && 
            (teamProgress[teamName][challengeId].solved === true || 
             teamProgress[teamName][challengeId].status === 'solved')) {
            
            const team = teams.find(t => t.name === teamName);
            if (team && team.id && teamSubmissionsCache[team.id]) {
                const failsForChallenge = teamSubmissionsCache[team.id][challengeId] || 0;
                // Nombre total de tentatives = fails + 1 (la réussite)
                attempts[teamName] = failsForChallenge + 1;
            } else {
                // Par défaut, 1 tentative (succès direct)
                attempts[teamName] = 1;
            }
        }
    }
    
    // Mettre en cache avec la clé qui inclut les équipes sélectionnées
    challengeAttemptsCache[cacheKey] = attempts;
    
    debugLog('📊 Tentatives générées et mises en cache:', attempts);
    return attempts;
    
    /* Version réelle avec l'API CTFd (à implémenter):
    try {
        const response = await callCTFdAPI(`/api/v1/submissions?challenge_id=${challengeId}`);
        const submissions = response.data || [];
        
        // Compter les tentatives par équipe
        submissions.forEach(sub => {
            const teamName = teams.find(t => t.id === sub.team_id)?.name;
            if (teamName) {
                attempts[teamName] = (attempts[teamName] || 0) + 1;
            }
        });
        
        return attempts;
    } catch (error) {
        console.error('Erreur chargement tentatives:', error);
        return {};
    }
    */
}

// Validation function to test dependency logic
function validateDependencyLogic() {
    debugLog('🧪 TESTING DEPENDENCY LOGIC WITH KNOWN DATA...');
    
    // Create test challenge map
    const testMap = {
        '1': { name: 'Root A', dependencies: [], points: 100 },
        '2': { name: 'Root B', dependencies: [], points: 100 },
        '3': { name: 'Level 1 A', dependencies: ['1'], points: 200 },
        '4': { name: 'Level 1 B', dependencies: ['2'], points: 200 },
        '5': { name: 'Level 2', dependencies: ['3', '4'], points: 300 }
    };
    
    const testLevels = {};
    debugLog('🧪 Test challenge map:', testMap);
    
    Object.keys(testMap).forEach(id => {
        const level = calculateChallengeLevel(id, testMap, testLevels);
        debugLog(`🧪 Test result: ${testMap[id].name} → Level ${level}`);
    });
    
    debugLog('🧪 Expected levels: Root A=0, Root B=0, Level 1 A=1, Level 1 B=1, Level 2=2');
    debugLog('🧪 Actual levels:', testLevels);
    
    const isValid = testLevels['1'] === 0 && testLevels['2'] === 0 && 
                   testLevels['3'] === 1 && testLevels['4'] === 1 && 
                   testLevels['5'] === 2;
    
    debugLog(`🧪 Dependency logic test: ${isValid ? '✅ PASSED' : '❌ FAILED'}`);
    
    return isValid;
}

// ==================== NOTIFICATION SYSTEM REMOVED ====================
// All notifications now use console.log instead

// ==================== TEAM CACHE SYSTEM ====================
// Lazy loading system for team data

function getCachedTeamData(teamName) {
    return teamDataCache[teamName] || null;
}

function setCachedTeamData(teamName, data) {
    teamDataCache[teamName] = {
        data: data,
        timestamp: Date.now()
    };
}

function isCacheValid(teamName, maxAge = 5 * 60 * 1000) { // 5 minutes default
    const cached = teamDataCache[teamName];
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < maxAge;
}

function clearTeamCache(teamName = null) {
    if (teamName) {
        delete teamDataCache[teamName];
    } else {
        teamDataCache = {};
    }
}

async function loadTeamDataLazy(teamName) {
    // Check if already loading
    if (loadingTeams.has(teamName)) {
        debugLog(`Team ${teamName} is already being loaded...`);
        return;
    }
    
    // Check cache first - mais vérifier aussi que teamProgress existe
    if (isCacheValid(teamName) && teamProgress[teamName]) {
        debugLog(`📋 Using cached data for team ${teamName}`);
        const cached = getCachedTeamData(teamName);
        // S'assurer que teamProgress est synchronisé
        if (!teamProgress[teamName]) {
            teamProgress[teamName] = cached.data;
            syncTeamProgress();
        }
        return cached.data;
    } else if (!teamProgress[teamName]) {
        debugLog(`⚠️ teamProgress vide pour ${teamName}, forçage du rechargement`);
        clearTeamCache(teamName);
    }
    
    // Start loading
    loadingTeams.add(teamName);
    debugLog(`Loading data for team ${teamName}...`);
    
    try {
        debugLog(`🔄 Loading fresh data for team ${teamName}`);
        
        // In demo mode, generate mock data
        if (!isConnected || currentUser.token === 'demo') {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000)); // Simulate delay
            generateMockProgressDataForTeam(teamName);
            const mockData = teamProgress[teamName];
            setCachedTeamData(teamName, mockData);
            
            debugLog(`Team ${teamName} data loaded successfully`);
            return mockData;
        }
        
        // Charger les solves depuis l'API CTFd
        const team = teams.find(t => t.name === teamName);
        if (!team) {
            throw new Error(`Team ${teamName} not found`);
        }
        
        if (!team.id) {
            throw new Error(`Team ${teamName} has no ID`);
        }
        
        debugLog(`🔄 Loading solves for team ${teamName} (ID: ${team.id}, Individual: ${team.isIndividual || false})`);
        
        try {
            let solvesResponse;
            
            if (team.isIndividual) {
                // Mode individuel - charger les solves de l'utilisateur
                const userId = team.id.replace('user_', '');
                try {
                    solvesResponse = await callCTFdAPI(`/api/v1/users/${userId}/solves`);
                } catch (error) {
                    debugLog('Erreur API users/solves, tentative avec submissions');
                    // Fallback vers l'endpoint submissions
                    solvesResponse = await callCTFdAPI(`/api/v1/submissions?user_id=${userId}&type=correct`);
                }
            } else {
                // Mode équipe standard
                solvesResponse = await callCTFdAPI(`/api/v1/teams/${team.id}/solves`);
            }
            
            const solves = solvesResponse.data || [];
            
            debugLog(`📦 Received ${solves.length} solves for team ${teamName}`);
            
            // Construire teamProgress pour cette équipe
            if (!teamProgress[teamName]) {
                teamProgress[teamName] = {};
            }
            
            // Réinitialiser et remplir avec les solves
            for (const solve of solves) {
                const challId = String(solve.challenge_id);
                if (challengeMap[challId]) {
                    teamProgress[teamName][challId] = {
                        solved: true,
                        attempted: true,
                        locked: false,
                        date: solve.date,
                        points: challengeMap[challId].points
                    };
                }
            }
            
            // Marquer les challenges non résolus
            for (const challId in challengeMap) {
                if (!teamProgress[teamName][challId]) {
                    teamProgress[teamName][challId] = {
                        solved: false,
                        attempted: false,
                        locked: false,
                        date: null,
                        points: 0
                    };
                }
            }
            
            const data = teamProgress[teamName];
            setCachedTeamData(teamName, data);
            syncTeamProgress();
            
            debugLog(`✅ Team ${teamName} solves loaded: ${solves.length} challenges solved`);
            
            // Mettre à jour l'affichage des équipes
            if (userPermissions.canViewAllTeams) {
                generateTeamFilters();
            }
            
            return data;
            
        } catch (error) {
            console.error(`Erreur chargement solves pour ${teamName}:`, error);
            
            // Gestion spécifique selon le type d'erreur
            if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                debugWarn(`NetworkError pour team ${teamName} - possiblement un problème de proxy ou de permissions`);
            } else if (error.message.includes('403') || error.message.includes('401')) {
                debugWarn(`Permissions insuffisantes pour accéder aux solves de ${teamName}`);
            }
            
            // En cas d'erreur, initialiser avec des données vides
            teamProgress[teamName] = {};
            syncTeamProgress();
            throw error;
        }
        
    } catch (error) {
        console.error(`Failed to load data for team ${teamName}: ${error.message}`);
        throw error;
    } finally {
        loadingTeams.delete(teamName);
    }
}

// ==================== CHALLENGE DRAG & DROP SYSTEM ====================

function initializeDragAndDrop() {
    // Load custom positions from session storage
    const savedPositions = sessionStorage.getItem('customChallengePositions');
    if (savedPositions) {
        try {
            customPositions = JSON.parse(savedPositions);
            debugLog('📍 Loaded custom positions from session storage');
        } catch (e) {
            debugLog('⚠️ Failed to load custom positions from session storage');
        }
    }
}

function saveCustomPositions() {
    sessionStorage.setItem('customChallengePositions', JSON.stringify(customPositions));
    debugLog('💾 Saved custom positions to session storage');
}

function resetChallengePositions() {
    customPositions = {};
    sessionStorage.removeItem('customChallengePositions');
    debugLog('Challenge positions reset to automatic layout');
    
    // Recalculate and redraw
    if (Object.keys(challengeMap).length > 0) {
        updateDemoChallengePositions();
        
        // Use D3 rendering if available and ready
        if (d3SystemReady && window.renderD3Challenges && typeof isD3Ready === 'function' && isD3Ready()) {
            try {
                renderD3Challenges();
            } catch (error) {
                console.error('❌ D3 rendering failed:', error);
                debugLog('🔄 Falling back to legacy rendering');
                renderChallenges();
                updateDependencyArrows();
            }
        } else {
            renderChallenges();
            updateDependencyArrows();
        }
    }
}

function makeChallengeNodeDraggable(element, challengeId) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    const startDrag = (e) => {
        if (e.target.closest('.challenge-status')) return; // Don't drag from status icon
        
        isDragging = true;
        isDraggingChallenge = true;
        draggedChallengeId = challengeId;
        
        const rect = element.getBoundingClientRect();
        const containerRect = document.getElementById('transform-wrapper').getBoundingClientRect();
        
        startX = (e.clientX || e.touches[0].clientX);
        startY = (e.clientY || e.touches[0].clientY);
        
        initialX = rect.left - containerRect.left;
        initialY = rect.top - containerRect.top;
        
        element.style.cursor = 'grabbing';
        element.style.zIndex = '1000';
        element.style.transform = 'scale(1.05)';
        element.style.boxShadow = '0 12px 24px rgba(0,0,0,0.3)';
        
        e.preventDefault();
    };
    
    const drag = (e) => {
        if (!isDragging) return;
        
        const currentX = (e.clientX || e.touches[0].clientX);
        const currentY = (e.clientY || e.touches[0].clientY);
        
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        
        const newX = initialX + deltaX / currentZoom;
        const newY = initialY + deltaY / currentZoom;
        
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        
        // Update dependency arrows in real-time
        updateDependencyArrows();
        
        e.preventDefault();
    };
    
    const endDrag = (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        isDraggingChallenge = false;
        draggedChallengeId = null;
        
        element.style.cursor = 'grab';
        element.style.zIndex = '10';
        element.style.transform = 'scale(1)';
        element.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        
        // Save new position
        const rect = element.getBoundingClientRect();
        const containerRect = document.getElementById('transform-wrapper').getBoundingClientRect();
        
        const finalX = rect.left - containerRect.left;
        const finalY = rect.top - containerRect.top;
        
        customPositions[challengeId] = { x: finalX, y: finalY };
        challengeMap[challengeId].position = { x: finalX, y: finalY };
        
        saveCustomPositions();
        debugLog(`Challenge "${challengeMap[challengeId].name}" position saved`);
        
        e.preventDefault();
    };
    
    // Mouse events
    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    
    // Touch events
    element.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', endDrag, { passive: false });
    
    // Set initial cursor
    element.style.cursor = 'grab';
}

// Variables pour la navigation et le zoom
let currentZoom = 1;
let currentPan = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let lastPan = { x: 0, y: 0 };

// Fonction pour gérer la pagination automatiquement
async function callCTFdAPIWithPagination(endpoint, method = 'GET') {
    let allData = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
        const separator = endpoint.includes('?') ? '&' : '?';
        const paginatedEndpoint = `${endpoint}${separator}page=${page}`;
        
        try {
            const response = await callCTFdAPI(paginatedEndpoint, method);
            
            if (response.data && Array.isArray(response.data)) {
                allData = allData.concat(response.data);
                
                // Vérifier s'il y a plus de pages
                if (response.meta && response.meta.pagination) {
                    const pagination = response.meta.pagination;
                    hasMore = pagination.page < pagination.pages;
                    debugLog(`Page ${pagination.page}/${pagination.pages}`);
                } else {
                    // Si pas de métadonnées de pagination, on suppose qu'il n'y a qu'une page
                    hasMore = false;
                }
            } else {
                // Pas un tableau, on retourne tel quel
                return response;
            }
            
            page++;
        } catch (error) {
            console.error('Erreur pagination page', page, ':', error);
            hasMore = false;
        }
    }
    
    debugLog(`Pagination terminée pour ${endpoint}: ${allData.length} éléments récupérés`);
    return { data: allData };
}

// Configuration des challenges avec leurs dépendances (positions seront recalculées)
let challengeMap = {
    'osint-start': { name: 'Reconnaissance Passive', position: { x: 0, y: 0 }, dependencies: [], points: 50, category: 'OSINT' },
    'google-dork': { name: 'Google Dorking', position: { x: 0, y: 0 }, dependencies: ['osint-start'], points: 100, category: 'OSINT' },
    'whois-investigation': { name: 'WHOIS Investigation', position: { x: 0, y: 0 }, dependencies: ['osint-start'], points: 100, category: 'OSINT' },
    'social-media': { name: 'Social Media Hunt', position: { x: 0, y: 0 }, dependencies: ['google-dork'], points: 150, category: 'OSINT' },
    'email-investigation': { name: 'Email Investigation', position: { x: 0, y: 0 }, dependencies: ['google-dork', 'whois-investigation'], points: 200, category: 'OSINT' },
    'dns-enum': { name: 'DNS Enumeration', position: { x: 0, y: 0 }, dependencies: ['whois-investigation'], points: 150, category: 'Network' },
    'geolocation': { name: 'Geolocation Analysis', position: { x: 0, y: 0 }, dependencies: ['social-media'], points: 250, category: 'OSINT' },
    'metadata': { name: 'Metadata Extraction', position: { x: 0, y: 0 }, dependencies: ['social-media', 'email-investigation'], points: 200, category: 'Forensics' },
    'subdomain': { name: 'Subdomain Discovery', position: { x: 0, y: 0 }, dependencies: ['dns-enum', 'email-investigation'], points: 300, category: 'Network' },
    'deepweb': { name: 'Deep Web Search', position: { x: 0, y: 0 }, dependencies: ['dns-enum'], points: 350, category: 'OSINT' },
    'timeline': { name: 'Timeline Construction', position: { x: 0, y: 0 }, dependencies: ['geolocation', 'metadata'], points: 400, category: 'Analysis' },
    'network-map': { name: 'Network Mapping', position: { x: 0, y: 0 }, dependencies: ['subdomain', 'metadata'], points: 450, category: 'Network' },
    'advanced-osint': { name: 'Advanced OSINT', position: { x: 0, y: 0 }, dependencies: ['subdomain', 'deepweb'], points: 500, category: 'OSINT' },
    'final-investigation': { name: 'Final Investigation', position: { x: 0, y: 0 }, dependencies: ['timeline', 'network-map', 'advanced-osint'], points: 1000, category: 'Final' }
};

// Fonction pour recalculer les positions des challenges de démo avec logique hiérarchique correcte
function updateDemoChallengePositions() {
    debugLog('=== RECALCUL DES POSITIONS DÉMO ===');
    
    // Calculer les niveaux hiérarchiques avec la nouvelle logique
    const levels = {};
    const visited = new Set();
    
    debugLog('Challenges disponibles:', Object.keys(challengeMap));
    
    Object.keys(challengeMap).forEach(challengeId => {
        visited.clear(); // Reset visited pour chaque calcul de niveau principal
        const level = calculateChallengeLevel(challengeId, challengeMap, levels, visited);
        debugLog(`${challengeMap[challengeId].name}: niveau ${level}`);
    });
    
    // Grouper par niveau
    const levelGroups = {};
    const maxLevel = Math.max(...Object.values(levels), 0);
    
    debugLog(`Niveau maximum calculé: ${maxLevel}`);
    
    // Initialiser les groupes de niveaux
    for (let level = 0; level <= maxLevel; level++) {
        levelGroups[level] = [];
    }
    
    // Assigner chaque challenge à son niveau
    Object.entries(challengeMap).forEach(([challengeId, challenge]) => {
        const level = levels[challengeId] || 0;
        levelGroups[level].push(challengeId);
        debugLog(`${challenge.name} assigné au niveau ${level}`);
    });
    
    // Afficher la distribution finale
    for (let level = 0; level <= maxLevel; level++) {
        const challenges = levelGroups[level];
        debugLog(`Niveau ${level}: ${challenges.length} challenges - [${challenges.map(id => challengeMap[id].name).join(', ')}]`);
    }
    
    // ✅ CONSISTENT POSITIONING ALGORITHM - MATCHES MAIN ALGORITHM
    const CANVAS_WIDTH = 1400;
    const LEVEL_HEIGHT = 200;
    const CHALLENGE_WIDTH = 140;
    const START_Y = 60;        // Level 0 at TOP
    const MIN_SPACING = 180;
    
    debugLog('=== ✅ DEMO POSITIONING - TOP-DOWN HIERARCHY ===');
    
    for (let level = 0; level <= maxLevel; level++) {
        const challenges = levelGroups[level];
        if (challenges.length === 0) continue;
        
        // ✅ CORRECT: Level 0 = TOP (smallest Y), higher levels = BOTTOM (larger Y)
        const y = START_Y + (level * LEVEL_HEIGHT);
        
        // Smart horizontal distribution
        let spacing, startX;
        
        if (challenges.length === 1) {
            // Single challenge: center horizontally
            startX = (CANVAS_WIDTH - CHALLENGE_WIDTH) / 2;
            spacing = 0;
        } else {
            // Multiple challenges: distribute with optimal spacing
            const totalWidth = CANVAS_WIDTH - 160;
            const optimalSpacing = totalWidth / (challenges.length - 1);
            spacing = Math.max(MIN_SPACING, Math.min(optimalSpacing, 350));
            
            const totalUsedWidth = (challenges.length - 1) * spacing;
            startX = (CANVAS_WIDTH - totalUsedWidth) / 2;
        }
        
        const levelType = level === 0 ? 'ROOT' : `LEVEL-${level}`;
        debugLog(`📍 ${levelType} ${level}: ${challenges.length} challenges at Y=${y}, startX=${startX}, spacing=${spacing || 'N/A'}`);
        
        // Position each challenge
        challenges.forEach((challengeId, index) => {
            const x = challenges.length === 1 ? startX : startX + (index * spacing);
            
            challengeMap[challengeId].position = {
                x: Math.round(x),
                y: y
            };
            
            debugLog(`  ✅ ${challengeMap[challengeId].name}: (${challengeMap[challengeId].position.x}, ${challengeMap[challengeId].position.y})`);
        });
    }
    
    debugLog('✓ Positions des challenges de démo mises à jour');
    debugLog('Niveaux finaux:', levels);
    
    // Vérification finale
    Object.entries(challengeMap).forEach(([id, challenge]) => {
        debugLog(`${challenge.name}: Niveau ${levels[id]}, Position (${challenge.position.x}, ${challenge.position.y}), Dépendances: [${challenge.dependencies.join(', ')}]`);
    });
}

// Initialiser les positions des challenges de démo
updateDemoChallengePositions();

function showCORSInstructions() {
    const instructions = 
`🔧 SOLUTIONS POUR CORRIGER L'ERREUR CORS :

1. 📡 PROXY CORS (Solution rapide)
   • Ajoutez "https://cors-anywhere.herokuapp.com/" devant votre URL CTFd
   • Exemple: https://cors-anywhere.herokuapp.com/https://demo.ctfd.io
   • ⚠️ À utiliser uniquement pour les tests

2. 🔌 EXTENSION NAVIGATEUR (Recommandé pour le développement)
   • Chrome: "CORS Unblock" ou "Disable CORS"
   • Firefox: "CORS Everywhere" 
   • ⚠️ Désactivez après utilisation

3. ⚙️ CONFIGURATION CTFD (Solution permanente)
   Ajoutez dans la configuration CTFd:
   • Access-Control-Allow-Origin: *
   • Access-Control-Allow-Headers: Authorization, Content-Type
   • Access-Control-Allow-Methods: GET, POST, PUT, DELETE

4. 🏠 HÉBERGEMENT LOCAL (Solution pro)
   • Hébergez cette page sur le même domaine que CTFd
   • Ou utilisez un reverse proxy (nginx, Apache)

5. 📱 ALTERNATIVE API
   • Utilisez l'interface CTFd directement
   • Ou développez un backend intermédiaire`;
    
    debugLog(instructions);
}

function showError(message) {
    const errorElement = document.getElementById('api-error');
    errorElement.innerHTML = `<strong>Erreur :</strong> ${message}`;
    errorElement.style.display = 'block';
}

function showLoginLoader(message = 'Chargement...') {
    const loader = document.getElementById('login-loading');
    const messageElement = document.getElementById('loading-message');
    if (loader) {
        loader.style.display = 'flex';
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
}

function hideLoginLoader() {
    const loader = document.getElementById('login-loading');
    if (loader) {
        loader.style.display = 'none';
    }
}

function toggleLoginFields() {
    // Plus besoin de cette fonction, le token détermine tout
}

function loadTeamsList() {
    // Simulation de la liste des équipes depuis CTFd
    const teamSelect = document.getElementById('team-select');
    const demoTeams = [
        'CyberDetectives', 'InfoHunters', 'DigitalSleuth', 'TrackMasters', 
        'DataHounds', 'NetTrackers', 'SearchExperts', 'IntelGatherers'
    ];
    
    if (teamSelect) {
        teamSelect.innerHTML = '<option value="">Sélectionner une équipe...</option>';
        demoTeams.forEach(team => {
            teamSelect.innerHTML += `<option value="${team}">${team}</option>`;
        });
    }
}

async function connectToAPI() {
    const ctfdUrl = document.getElementById('ctfd-url').value.trim();
    const token = document.getElementById('api-token').value.trim();
    
    // Afficher le loader
    showLoginLoader('Connexion en cours...');
    
    if (!ctfdUrl) {
        debugWarn('Veuillez saisir l\'URL CTFd');
        hideLoginLoader();
        return;
    }

    if (!token) {
        debugWarn('Veuillez saisir votre token API CTFd');
        hideLoginLoader();
        return;
    }

    updateAPIStatus('loading', 'Vérification du token...');
    
    // Si on utilise le proxy local, informer de la nouvelle URL
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000') {
        try {
            await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ctfdUrl: ctfdUrl })
            });
            debugLog('URL proxy mise à jour:', ctfdUrl);
        } catch (configError) {
            debugWarn('Impossible de mettre à jour l\'URL du proxy:', configError);
        }
    }
    
    try {
        await authenticateWithCTFd(ctfdUrl, token);
    } catch (error) {
        updateAPIStatus('disconnected', 'Erreur de connexion');
        hideLoginLoader();
        
        if (error.message === 'CORS_POLICY_ERROR') {
            showCORSError();
        } else {
            showError('Erreur de connexion à l\'API CTFd: ' + error.message);
        }
    }
}

async function authenticateWithCTFd(ctfdUrl, token) {
    // Appel API pour vérifier le token et récupérer les permissions
    currentUser.ctfdUrl = ctfdUrl;
    currentUser.token = token;
    
    try {
        // 1. Vérifier le token et récupérer les infos utilisateur
        showLoginLoader('Vérification du token...');
        const userInfo = await callCTFdAPI('/api/v1/users/me', 'GET');
        currentUser.name = userInfo.data.name;
        currentUser.id = userInfo.data.id;
        
        // 2. Tester les permissions en tentant d'accéder aux endpoints admin
        showLoginLoader('Vérification des permissions...');
        try {
            await callCTFdAPI('/api/v1/users', 'GET');
            // Si cet appel réussit, l'utilisateur a des droits admin
            userPermissions.isAdmin = true;
            userPermissions.canViewAllTeams = true;
            userPermissions.canViewFutureChalls = true;
            updateAPIStatus('connected', `Admin: ${currentUser.name}`);
        } catch (adminError) {
            // L'utilisateur n'a pas les droits admin
            userPermissions.isAdmin = false;
            userPermissions.canViewAllTeams = false;
            userPermissions.canViewFutureChalls = false;
            updateAPIStatus('connected', `Équipe: ${currentUser.name}`);
        }
        
        // 3. Vérifier l'état du CTF
        try {
            const configResponse = await callCTFdAPI('/api/v1/configs');
            debugLog('Configuration CTFd:', configResponse.data);
            
            // Vérifier si le CTF est en mode setup ou fini
            const ctfName = configResponse.data?.ctf_name || 'CTF';
            const startTime = configResponse.data?.start || null;
            const endTime = configResponse.data?.end || null;
            
            if (startTime) {
                const start = new Date(startTime * 1000);
                const now = new Date();
                if (now < start) {
                    showError(`Le CTF "${ctfName}" n'a pas encore commencé. Début : ${start.toLocaleString()}`);
                }
            }
            
            if (endTime) {
                const end = new Date(endTime * 1000);
                const now = new Date();
                if (now > end) {
                    showError(`Le CTF "${ctfName}" est terminé depuis le ${end.toLocaleString()}`);
                }
            }
        } catch (e) {
            debugLog('Impossible de récupérer la config CTFd:', e);
        }
        
        // 4. Charger les données selon les permissions
        showLoginLoader('Chargement des données...');
        await loadDataBasedOnPermissions();
        
        hideLoginLoader();
        showMainInterface();
        
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            throw new Error('Token invalide ou expiré');
        } else if (error.status === 404) {
            throw new Error('URL CTFd incorrecte');
        } else if (error.status === 'CORS') {
            throw new Error('CORS_POLICY_ERROR');
        } else if (error.message.includes('TOKEN_AUTH_NOT_SUPPORTED')) {
            throw new Error('Cette instance CTFd ne supporte pas l\'authentification par token API. Utilisez la connexion par session web.');
        } else {
            throw new Error('Erreur de connexion: ' + error.message);
        }
    }
}

async function callCTFdAPI(endpoint, method = 'GET', data = null) {
    // Si on utilise le proxy local, modifier l'URL
    let url;
    debugLog('🔍 DEBUG PROXY:', {
        hostname: window.location.hostname,
        port: window.location.port,
        href: window.location.href,
        isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        isPort3000: window.location.port === '3000',
        currentCtfdUrl: currentUser.ctfdUrl
    });
    
    // Vérifier si on doit utiliser le proxy ou un appel direct
    const isLocalProxy = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000';
    
    if (isLocalProxy) {
        // Utiliser le proxy (qui est maintenant dynamique)
        debugLog('✅ Using PROXY for endpoint:', endpoint);
        url = endpoint;
    } else {
        // Appel direct (avec risque CORS)
        debugLog('❌ Using DIRECT call to:', currentUser.ctfdUrl);
        url = `${currentUser.ctfdUrl}${endpoint}`;
    }
    
    const options = {
        method: method,
        headers: {
            'Authorization': `Token ${currentUser.token}`,
            'Content-Type': 'application/json',
        },
        mode: 'cors', // Explicitement demander CORS
        credentials: 'omit' // Ne pas envoyer de cookies
    };
    
    debugLog('🌐 API CALL:', url, 'avec token:', currentUser.token ? 'Oui' : 'Non');
    debugLog('📋 Request details:', {
        method: method,
        headers: options.headers,
        hasBody: !!options.body
    });
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            console.error('Erreur HTTP:', response.status, 'pour', url);
            
            // Essayer de lire le corps de la réponse pour plus de détails
            let errorDetails = '';
            try {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    errorDetails = errorData.message || JSON.stringify(errorData);
                } catch (e) {
                    errorDetails = errorText;
                    // Détecter si la réponse contient une redirection vers login
                    if (errorText.includes('Redirecting') && errorText.includes('/login?next=')) {
                        errorDetails = 'TOKEN_AUTH_NOT_SUPPORTED';
                    }
                }
            } catch (e) {
                errorDetails = 'Erreur inconnue';
            }
            
            const error = new Error(`HTTP ${response.status}: ${errorDetails}`);
            error.status = response.status;
            throw error;
        }
        
        const data = await response.json();
        debugLog('📦 API RESPONSE:', {
            endpoint: endpoint,
            status: response.status,
            ok: response.ok,
            dataType: typeof data,
            hasData: !!data.data,
            dataLength: Array.isArray(data.data) ? data.data.length : 'N/A'
        });
        debugLog('📄 Full response data:', data);
        return data;
    } catch (error) {
        // Gestion spécifique de l'erreur CORS
        if (error.name === 'TypeError' && error.message.includes('CORS')) {
            const corsError = new Error('CORS_ERROR');
            corsError.status = 'CORS';
            throw corsError;
        }
        throw error;
    }
}

async function loadDataBasedOnPermissions() {
    if (userPermissions.isAdmin) {
        await loadAdminData();
    } else {
        await loadUserData();
    }
}

async function preloadAllTeams() {
    try {
        debugLog('🏁 Préchargement de toutes les équipes/joueurs...');
        showLoginLoader('Chargement des équipes...');
        let allTeams = [];
        let page = 1;
        let hasMore = true;
        
        // Détecter le mode du CTF sans accès admin
        let isIndividualMode = false;
        
        // Méthode 1: Vérifier si l'endpoint teams retourne des données
        try {
            const teamsTestResponse = await callCTFdAPI('/api/v1/teams?page=1');
            if (!teamsTestResponse.data || teamsTestResponse.data.length === 0) {
                debugLog('Aucune équipe trouvée - possible mode individuel');
                isIndividualMode = true;
            }
        } catch (teamsError) {
            debugLog('Erreur accès équipes:', teamsError);
            // Si l'endpoint teams n'est pas accessible, c'est probablement un mode individuel
            if (teamsError.message.includes('404') || teamsError.message.includes('403')) {
                isIndividualMode = true;
            }
        }
        
        // Méthode 2: Si on a toujours un doute, vérifier le scoreboard
        if (!isIndividualMode) {
            try {
                const scoreboardResponse = await callCTFdAPI('/api/v1/scoreboard');
                // Si le scoreboard contient des "users" au lieu de "teams", c'est individuel
                if (scoreboardResponse.data && scoreboardResponse.data.users) {
                    isIndividualMode = true;
                }
            } catch (scoreError) {
                debugLog('Impossible de vérifier le scoreboard:', scoreError);
            }
        }
        
        debugLog(`Mode détecté: ${isIndividualMode ? 'individuel' : 'équipe'}`);
        
        if (isIndividualMode) {
            // Mode individuel - charger les utilisateurs au lieu des équipes
            showLoginLoader('Chargement des joueurs...');
            let allUsers = [];
            page = 1;
            hasMore = true;
            
            while (hasMore) {
                showLoginLoader(`Chargement des joueurs (page ${page})...`);
                const usersResponse = await callCTFdAPI(`/api/v1/users?page=${page}`);
                if (usersResponse.data && usersResponse.data.length > 0) {
                    allUsers = allUsers.concat(usersResponse.data);
                    if (usersResponse.data.length < 50) {
                        hasMore = false;
                    }
                    page++;
                } else {
                    hasMore = false;
                }
            }
            
            debugLog(`📊 ${allUsers.length} joueurs trouvés`);
            
            // Convertir les utilisateurs en "équipes" virtuelles
            const userColors = generateDistinctTeamColors(allUsers.length);
            setTeams(allUsers.map((user, index) => ({
                id: `user_${user.id}`,
                name: user.name,
                score: user.score || 0,
                place: user.place || (index + 1),
                color: userColors[index],
                isIndividual: true
            })));
            
            return;
        }
        
        // Mode équipe standard
        while (hasMore) {
            showLoginLoader(`Chargement des équipes (page ${page})...`);
            const teamsResponse = await callCTFdAPI(`/api/v1/teams?page=${page}`);
            if (teamsResponse.data && teamsResponse.data.length > 0) {
                allTeams = allTeams.concat(teamsResponse.data);
                // CTFd retourne généralement 50 équipes par page
                if (teamsResponse.data.length < 50) {
                    hasMore = false;
                }
                page++;
            } else {
                hasMore = false;
            }
        }
        
        debugLog(`📊 ${allTeams.length} équipes trouvées`);
        
        // Generate distinct colors for all teams
        const teamColors = generateDistinctTeamColors(allTeams.length);
        
        // Enrichir avec les infos de base (sans les solves) - en batch pour éviter trop d'appels
        setTeams(allTeams.map((team, index) => ({
            id: team.id,
            name: team.name,
            score: team.score || 0,
            place: team.place || (index + 1),
            color: teamColors[index],
            // Les solves seront chargés à la demande
            solvesLoaded: false
        })));
        
        // Trier selon le mode actuel
        if (teamSortMode === 'name') {
            teams.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            teams.sort((a, b) => b.score - a.score);
        }
        // Re-sync after sorting
        window.teams = teams;
        debugLog(`✅ ${teams.length} équipes préchargées`);
        
    } catch (error) {
        console.error('Erreur préchargement équipes:', error);
        teams = [];
    }
}

async function loadAdminData() {
    try {
        // Précharger toutes les équipes
        await preloadAllTeams();
        
        // Start with no teams selected for lazy loading
        setSelectedTeams([]);
        
        // Charger TOUS les challenges (y compris cachés) pour les admins avec view=admin
        try {
            const challengesResponse = await callCTFdAPI('/api/v1/challenges?view=admin');
            challenges = challengesResponse.data || [];
            debugLog('Challenges chargés (admin avec view=admin):', challenges.length);
            
            // Compter les challenges par état
            const challengesByState = {};
            challenges.forEach(c => {
                const state = c.state || 'visible';
                challengesByState[state] = (challengesByState[state] || 0) + 1;
            });
            debugLog('Challenges par état:', challengesByState);
            
            if (challenges.length === 0) {
                debugWarn('Aucun challenge trouvé, même avec view=admin.');
                showError('Aucun challenge dans CTFd. Créez des challenges dans l\'interface d\'administration.');
            }
        } catch (challengeError) {
            console.error('Erreur lors du chargement des challenges:', challengeError);
            if (challengeError.message.includes('403') || challengeError.message.includes('404')) {
                showError('L\'API challenges n\'est pas accessible. Le CTF n\'a peut-être pas encore démarré ou est terminé.');
                // Utiliser les données de démo si pas d'accès aux challenges
                challenges = [];
            } else {
                throw challengeError;
            }
        }
        
        // Créer challengeMap à partir des vraies données CTFd
        await buildChallengeMapFromCTFd(challenges);
        
        // Ne plus charger les solves au démarrage - ils seront chargés à la demande
        debugLog('✅ Challenges et équipes chargés. Les solves seront chargés à la demande.');
        
        // Activer tous les contrôles pour les admins
        document.getElementById('teams-section').classList.remove('admin-only');
        document.getElementById('paths-btn').classList.remove('disabled');
        document.getElementById('heatmap-btn').classList.remove('disabled');
        
        // Régénérer la liste des équipes
        generateTeamFilters();
        
        // Mettre à jour les statistiques globales
        updateGlobalStats();
        
        // Charger automatiquement les données des premières équipes
        // ou des équipes qui étaient sélectionnées avant déconnexion
        if (teams.length > 0) {
            debugLog('🔄 Chargement automatique des données pour les premières équipes...');
            
            // Récupérer les équipes précédemment sélectionnées depuis sessionStorage
            let teamsToLoad = [];
            try {
                const savedSelectedTeams = sessionStorage.getItem('selectedTeams');
                if (savedSelectedTeams) {
                    const savedTeamNames = JSON.parse(savedSelectedTeams);
                    // Vérifier que ces équipes existent toujours
                    teamsToLoad = savedTeamNames.filter(name => 
                        teams.some(t => t.name === name)
                    ).slice(0, 5); // Limiter à 5 équipes max
                }
            } catch (e) {
                debugLog('Impossible de récupérer les équipes sauvegardées:', e);
            }
            
            // Si pas d'équipes sauvegardées, charger les 3 premières par défaut
            if (teamsToLoad.length === 0) {
                teamsToLoad = teams.slice(0, 3).map(t => t.name);
            }
            
            // Charger les données et sélectionner ces équipes
            debugLog(`📊 Chargement automatique de ${teamsToLoad.length} équipes:`, teamsToLoad);
            
            // D'abord sélectionner toutes les équipes
            setSelectedTeams(teamsToLoad);
            
            // Puis charger leurs données
            for (const teamName of teamsToLoad) {
                try {
                    await loadTeamDataLazy(teamName);
                    
                    // Charger aussi les submissions de l'équipe
                    const team = teams.find(t => t.name === teamName);
                    if (team && team.id) {
                        await loadTeamSubmissions(team.id);
                    }
                    
                    // Mettre à jour la checkbox
                    const checkbox = Array.from(document.querySelectorAll('#team-filters input[type="checkbox"]'))
                        .find(cb => cb.parentElement.querySelector('.team-name')?.textContent === teamName);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                } catch (error) {
                    debugWarn(`Impossible de charger les données pour ${teamName}:`, error);
                }
            }
            
            // Régénérer les filtres pour mettre à jour les compteurs
            generateTeamFilters();
            
            // Mettre à jour la visualisation avec les équipes chargées
            setTimeout(() => {
                updateVisualization();
                updateGlobalStats();
                updateLiveStats();
            }, 100);
        }
        
    } catch (error) {
        console.error('Erreur lors du chargement des données admin:', error);
        showError('Erreur de chargement: ' + error.message + '. Vérifiez que l\'API CTFd est accessible.');
        // Fallback vers des données de démo
        generateMockAdminData();
    }
}

async function loadUserData() {
    try {
        // Charger seulement les données accessibles à cet utilisateur
        let userTeamResponse, teamId;
        try {
            userTeamResponse = await callCTFdAPI(`/api/v1/users/${currentUser.id}`);
            teamId = userTeamResponse.data.team_id;
        } catch (profileError) {
            console.error('Erreur lors de l\'accès au profil utilisateur:', profileError);
            if (profileError.message.includes('403') || profileError.message.includes('401')) {
                showError('L\'API ne permet pas l\'accès aux informations de profil. Permissions insuffisantes.');
                return;
            }
            throw profileError;
        }
        
        if (teamId) {
            // Mode équipe confirmé - l'utilisateur a une équipe
            try {
                const teamResponse = await callCTFdAPI(`/api/v1/teams/${teamId}`);
                teams = [{
                    id: teamId,
                    name: teamResponse.data.name,
                    color: '#3b82f6'
                }];
                setSelectedTeams([teamResponse.data.name]);
                currentUser.teamName = teamResponse.data.name;
            } catch (teamError) {
                debugLog('Erreur accès équipe:', teamError);
                // Fallback au mode individuel si l'équipe n'est pas accessible
                teamId = null;
            }
        }
        
        if (!teamId) {
            // Mode individuel ou pas d'équipe assignée
            debugLog('Mode individuel détecté - pas d\'équipe assignée');
            
            // Vérifier si c'est vraiment un mode individuel en testant l'endpoint teams
            let isIndividualMode = true;
            try {
                const teamsCheck = await callCTFdAPI('/api/v1/teams?page=1');
                if (teamsCheck.data && teamsCheck.data.length > 0) {
                    // Il y a des équipes, donc c'est un CTF en équipe mais l'utilisateur n'en a pas
                    isIndividualMode = false;
                    showError('Vous n\'êtes assigné à aucune équipe. Rejoignez ou créez une équipe pour participer.');
                }
            } catch (e) {
                debugLog('Impossible de vérifier les équipes:', e);
            }
            
            teams = [{
                id: `user_${currentUser.id}`,
                name: currentUser.name,
                color: '#3b82f6',
                isIndividual: true
            }];
            setSelectedTeams([currentUser.name]);
            currentUser.teamName = currentUser.name;
        }
        
        // Charger seulement les challenges visibles/accessibles pour les utilisateurs
        try {
            const challengesResponse = await callCTFdAPI('/api/v1/challenges');
            challenges = challengesResponse.data || [];
            debugLog('Challenges chargés (user standard):', challenges.length);
            
            if (challenges.length === 0) {
                debugWarn('Aucun challenge visible pour cet utilisateur.');
                showError('Aucun challenge disponible. Le CTF n\'a peut-être pas encore commencé.');
                
                // Pour les utilisateurs, garder les données de démo si aucun challenge
                debugLog('Utilisation des données de démo pour l\'utilisateur');
            }
        } catch (challengeError) {
            console.error('Erreur lors du chargement des challenges:', challengeError);
            if (challengeError.message.includes('403') || challengeError.message.includes('404')) {
                showError('L\'API challenges n\'est pas accessible. Le CTF n\'a peut-être pas encore démarré ou est terminé.');
                // Utiliser les données de démo si pas d'accès aux challenges
                challenges = [];
            } else {
                throw challengeError;
            }
        }
        
        // Créer challengeMap à partir des vraies données CTFd
        await buildChallengeMapFromCTFd(challenges);
        
        // Charger les soumissions selon le mode (équipe ou individuel)
        let submissions = [];
        if (teamId) {
            // Mode équipe - charger les solves de l'équipe
            const teamSubmissionsResponse = await callCTFdAPI(`/api/v1/teams/${teamId}/solves`);
            submissions = teamSubmissionsResponse.data || [];
        } else {
            // Mode individuel - charger les solves de l'utilisateur
            try {
                const userSubmissionsResponse = await callCTFdAPI(`/api/v1/users/${currentUser.id}/solves`);
                submissions = userSubmissionsResponse.data || [];
            } catch (error) {
                debugLog('Erreur lors du chargement des solves utilisateur:', error);
                // Fallback : essayer l'endpoint submissions
                try {
                    const submissionsResponse = await callCTFdAPI(`/api/v1/submissions?user_id=${currentUser.id}&type=correct`);
                    submissions = submissionsResponse.data || [];
                } catch (fallbackError) {
                    debugLog('Erreur fallback submissions:', fallbackError);
                    submissions = [];
                }
            }
        }
        
        // Générer les données de progression
        generateUserProgressFromSubmissions(submissions);
        
        // Désactiver les contrôles multi-équipes
        document.getElementById('teams-section').classList.add('admin-only');
        document.getElementById('paths-btn').classList.add('disabled');
        document.getElementById('heatmap-btn').classList.add('disabled');
        
    } catch (error) {
        console.error('Erreur lors du chargement des données utilisateur:', error);
        showError('Erreur de chargement: ' + error.message + '. Vérifiez que l\'API CTFd est accessible.');
        // Fallback vers des données de démo
        generateMockUserData();
    }
}

async function loadDemoData(type) {
    showLoginLoader('Chargement du mode démo...');
    
    // Simuler un délai de chargement
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (type === 'admin') {
        currentUser = { name: 'Demo Admin', token: 'demo_admin_token', ctfdUrl: 'demo', teamName: null, id: null };
        userPermissions = { isAdmin: true, canViewAllTeams: true, canViewFutureChalls: true };
        generateMockAdminData();
    } else {
        currentUser = { name: 'Demo User', token: 'demo_user_token', ctfdUrl: 'demo', teamName: 'Demo Team', id: null };
        userPermissions = { isAdmin: false, canViewAllTeams: false, canViewFutureChalls: false };
        generateMockUserData();
    }
    
    updateAPIStatus('connected', `Mode démo: ${userPermissions.isAdmin ? 'Admin' : 'Équipe'}`);
    hideLoginLoader();
    showMainInterface();
}

function generateMockAdminData() {
    const mockTeams = [
        'CyberDetectives', 'InfoHunters', 'DigitalSleuth', 'TrackMasters', 
        'DataHounds', 'NetTrackers', 'SearchExperts', 'IntelGatherers'
    ];
    
    // Use the distinct color generator for demo teams
    const teamColors = generateDistinctTeamColors(mockTeams.length);
    
    teams = mockTeams.map((name, index) => ({
        name: name,
        color: teamColors[index]
    }));
    
    setSelectedTeams([]); // Start with no teams selected for lazy loading
    generateMockProgressData();
    
    // Activer tous les contrôles pour les admins
    document.getElementById('teams-section').classList.remove('admin-only');
    document.getElementById('paths-btn').classList.remove('disabled');
    document.getElementById('heatmap-btn').classList.remove('disabled');
    
    // Régénérer la liste des équipes
    generateTeamFilters();
    
    // Mettre à jour les statistiques globales
    updateGlobalStats();
}

function generateMockUserData() {
    teams = [{ name: 'Demo Team', color: '#3b82f6' }];
    setSelectedTeams(['Demo Team']);
    currentUser.teamName = 'Demo Team';
    generateMockProgressDataForTeam('Demo Team');
    
    // Désactiver les contrôles multi-équipes
    document.getElementById('teams-section').classList.add('admin-only');
    document.getElementById('paths-btn').classList.add('disabled');
    document.getElementById('heatmap-btn').classList.add('disabled');
}

function generateProgressFromTeamSolves(teamSolves) {
    // Nouvelle fonction optimisée qui utilise les solves des équipes directement
    teams.forEach(team => {
        teamProgress[team.name] = {};
        
        // Récupérer les solves de cette équipe
        const teamSolveData = teamSolves.find(ts => ts.teamId === team.id);
        const solves = teamSolveData ? teamSolveData.solves : [];
        
        Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
            // Vérifier si l'équipe a résolu ce challenge
            const solve = solves.find(s => 
                s.challenge_id === challengeInfo.ctfd_id || 
                s.challenge_id === parseInt(challengeId)
            );
            
            const solved = !!solve;
            const attempted = solved; // Dans CTFd, on ne voit que les résolutions
            const attempts = solved ? 1 : 0; // Approximation
            
            // Temps passé (approximation)
            let timeSpent = solved ? Math.floor(Math.random() * 60) + 10 : 0;
            
            // Vérifier les dépendances
            const dependenciesResolved = challengeInfo.dependencies.every(dep => 
                teamProgress[team.name][dep]?.solved || false
            );
            
            // Vérifier si le challenge est caché
            const isHidden = challengeInfo.state === 'hidden';
            
            teamProgress[team.name][challengeId] = {
                solved: solved,
                attempted: attempted,
                locked: (!dependenciesResolved && challengeInfo.dependencies.length > 0) || isHidden,
                hidden: isHidden,
                timeSpent: timeSpent,
                attempts: attempts,
                points: solved ? challengeInfo.points : 0
            };
        });
    });
}

function generateProgressFromSubmissions(submissions) {
    // Analyser les vraies soumissions CTFd pour générer les données de progression
    teams.forEach(team => {
        teamProgress[team.name] = {};
        
        // Filtrer les soumissions de cette équipe
        const teamSubmissions = submissions.filter(sub => sub.team_id === team.id);
        
        Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
            // Trouver les soumissions pour ce challenge
            const challengeSubmissions = teamSubmissions.filter(sub => 
                sub.challenge_id === challengeInfo.ctfd_id || sub.challenge_id === parseInt(challengeId)
            );
            
            const solved = challengeSubmissions.some(sub => sub.type === 'correct');
            const attempted = challengeSubmissions.length > 0;
            const attempts = challengeSubmissions.length;
            
            // Calculer le temps total passé (approximation basée sur les timestamps)
            let timeSpent = 0;
            if (challengeSubmissions.length > 1) {
                const firstAttempt = new Date(challengeSubmissions[0].date);
                const lastAttempt = new Date(challengeSubmissions[challengeSubmissions.length - 1].date);
                timeSpent = Math.round((lastAttempt - firstAttempt) / (1000 * 60)); // en minutes
            }
            
            // Vérifier les dépendances
            const dependenciesResolved = challengeInfo.dependencies.every(dep => 
                teamProgress[team.name][dep]?.solved || false
            );
            
            // Vérifier si le challenge est caché
            const isHidden = challengeInfo.state === 'hidden';
            
            teamProgress[team.name][challengeId] = {
                solved: solved,
                attempted: attempted,
                locked: (!dependenciesResolved && challengeInfo.dependencies.length > 0) || isHidden,
                hidden: isHidden,
                timeSpent: timeSpent,
                attempts: attempts,
                points: solved ? challengeInfo.points : 0
            };
        });
    });
}

function generateUserProgressFromSubmissions(userSolves) {
    // Analyser les résolutions de l'utilisateur actuel
    const teamName = currentUser.teamName;
    teamProgress[teamName] = {};
    
    Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
        // Vérifier si l'utilisateur a résolu ce challenge  
        const challengeIdNum = parseInt(challengeId);
        const solve = userSolves.find(s => s.challenge_id === challengeIdNum);
        const solved = !!solve;
        
        // Pour les équipes, ne montrer que les challenges accessibles
        const dependenciesResolved = challengeInfo.dependencies.every(dep => 
            teamProgress[teamName][dep]?.solved || false
        );
        
        if (!dependenciesResolved && challengeInfo.dependencies.length > 0) {
            // Ne pas ajouter les challenges verrouillés pour les équipes
            return;
        }
        
        // Simulation des tentatives (CTFd ne stocke que les résolutions)
        const attempts = solved ? Math.floor(Math.random() * 3) + 1 : 0;
        const timeSpent = solved ? Math.floor(Math.random() * 60) + 10 : 0;
        
        teamProgress[teamName][challengeId] = {
            solved: solved,
            attempted: solved, // Nous n'avons que les résolutions dans CTFd
            locked: false,
            timeSpent: timeSpent,
            attempts: attempts,
            points: solved ? challengeInfo.points : 0,
            date: solved && solve ? solve.date : null
        };
    });
    
    // Synchroniser avec la référence globale
    syncTeamProgress();
    
    // Mettre en cache les données
    setCachedTeamData(teamName, teamProgress[teamName]);
    
    // Mettre à jour l'affichage des équipes si c'est pour l'utilisateur courant
    if (userPermissions.canViewAllTeams) {
        generateTeamFilters();
    }
}

function generateMockProgressData() {
    // For lazy loading, only generate data for already selected teams
    // This function is now mainly used for maintaining compatibility
    selectedTeams.forEach((teamName, teamIndex) => {
        const team = teams.find(t => t.name === teamName);
        if (!team) return;
        
        teamProgress[team.name] = {};
        const teamSkill = 0.9 - (teamIndex * 0.1);
        
        Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
            const dependenciesResolved = challengeInfo.dependencies.every(dep => 
                teamProgress[team.name][dep]?.solved || false
            );

            if (!dependenciesResolved && challengeInfo.dependencies.length > 0) {
                teamProgress[team.name][challengeId] = {
                    solved: false,
                    attempted: false,
                    locked: true,
                    timeSpent: 0,
                    attempts: 0
                };
                return;
            }

            const difficulty = challengeInfo.points / 100;
            const solveProb = Math.max(0.1, teamSkill / difficulty * (0.6 + Math.random() * 0.8));
            
            const solved = Math.random() < solveProb;
            const attempted = solved || Math.random() < 0.7;
            
            teamProgress[team.name][challengeId] = {
                solved: solved,
                attempted: attempted,
                locked: false,
                timeSpent: attempted ? Math.floor(Math.random() * 120) + 10 : 0,
                attempts: attempted ? Math.floor(Math.random() * 5) + 1 : 0,
                points: solved ? challengeInfo.points : 0,
                date: solved ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : null
            };
        });
    });
}

function generateMockProgressDataForTeam(teamName) {
    teamProgress[teamName] = {};
    const teamSkill = 0.7; // Compétence moyenne
    
    Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
        const dependenciesResolved = challengeInfo.dependencies.every(dep => 
            teamProgress[teamName][dep]?.solved || false
        );

        if (!dependenciesResolved && challengeInfo.dependencies.length > 0) {
            // Ne pas révéler les challenges verrouillés aux équipes
            return;
        }

        const difficulty = challengeInfo.points / 100;
        const solveProb = Math.max(0.1, teamSkill / difficulty * (0.6 + Math.random() * 0.8));
        
        const solved = Math.random() < solveProb;
        const attempted = solved || Math.random() < 0.7;
        
        teamProgress[teamName][challengeId] = {
            solved: solved,
            attempted: attempted,
            locked: false,
            timeSpent: attempted ? Math.floor(Math.random() * 120) + 10 : 0,
            attempts: attempted ? Math.floor(Math.random() * 5) + 1 : 0,
            points: solved ? challengeInfo.points : 0,
            date: solved ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : null
        };
    });
}

async function showMainInterface() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('container').style.display = 'flex';
    document.getElementById('user-display').textContent = `${currentUser.name} (${userPermissions.isAdmin ? 'Admin' : 'Équipe'})`;
    
    await initializeInterface();
}

async function initializeInterface() {
    // Initialize D3.js system now that container is visible
    debugLog('🔍 Checking D3 availability:', {
        d3SystemReady,
        hasInitializeD3: typeof window.initializeD3Visualization !== 'undefined',
        d3LibraryLoaded: typeof d3 !== 'undefined'
    });
    
    // Forcer la réinitialisation D3 après reconnexion
    if (window.initializeD3Visualization) {
        try {
            debugLog('🎨 Re-initializing D3.js system after login...');
            // Nettoyer l'ancien système D3
            if (window.clearD3Visualization) {
                window.clearD3Visualization();
            }
            d3SystemReady = false; // Forcer la réinitialisation
            
            const d3Initialized = await window.initializeD3Visualization();
            if (d3Initialized) {
                d3SystemReady = true;
                debugLog('✅ D3.js visualization system ready');
            }
        } catch (error) {
            console.error('❌ D3.js post-login initialization failed:', error);
        }
    }
    
    // S'assurer que selectedTeams est vide après reconnexion
    if (selectedTeams.length > 0) {
        debugLog('⚠️ Réinitialisation des équipes sélectionnées après reconnexion');
        setSelectedTeams([]);
    }
    
    generateTeamFilters();
    updateGlobalStats();
    
    // Mettre à jour la visualisation après avoir réinitialisé D3
    debugLog('🔄 Mise à jour de la visualisation après connexion');
    
    // S'assurer que challengeMap existe avant de continuer
    if (Object.keys(challengeMap).length === 0) {
        debugLog('⚠️ challengeMap vide, régénération...');
        generateChallengeMap();
    }
    
    // Utiliser un petit délai pour s'assurer que D3 est complètement initialisé
    setTimeout(async () => {
        updateVisualization();
        
        // Si pas d'équipes sélectionnées mais des données existent, forcer un rafraîchissement
        if (teams.length > 0 && selectedTeams.length === 0 && userPermissions.isAdmin) {
            debugLog('🔄 Aucune équipe sélectionnée, affichage de la vue d\'ensemble');
        }
    }, 100);
}

function generateTeamFilters(searchTerm = '') {
    if (!userPermissions.canViewAllTeams) return;
    
    const container = document.getElementById('team-filters');
    
    // Ajouter barre de recherche si pas déjà présente
    let searchBar = document.getElementById('team-search-container');
    if (!searchBar) {
        searchBar = document.createElement('div');
        searchBar.id = 'team-search-container';
        searchBar.innerHTML = `
            <input type="text" 
                   id="team-search" 
                   placeholder="🔍 Rechercher une équipe..." 
                   style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;"
                   oninput="searchTeams(this.value)">
        `;
        container.parentElement.insertBefore(searchBar, container);
    }
    
    // Filtrer les équipes selon la recherche
    let filteredTeams = teams.filter(team => 
        team.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Appliquer le filtre "showOnlySelected" si actif
    if (showOnlySelected) {
        filteredTeams = filteredTeams.filter(team => selectedTeams.includes(team.name));
    }
    
    // Toujours mettre les équipes sélectionnées en haut (sauf si on affiche uniquement les sélectionnées)
    if (!showOnlySelected) {
        const selectedFirst = [];
        const unselected = [];
        
        filteredTeams.forEach(team => {
            if (selectedTeams.includes(team.name)) {
                selectedFirst.push(team);
            } else {
                unselected.push(team);
            }
        });
        
        // Combiner avec les sélectionnées en premier
        filteredTeams = [...selectedFirst, ...unselected];
    }
    
    container.innerHTML = filteredTeams.map(team => {
        const isChecked = selectedTeams.includes(team.name);
        const totalChallenges = Object.keys(challengeMap).length;
        
        // Show loading indicator if team data is being loaded, cached data if available, or placeholder
        let progressText = '0/0';
        if (loadingTeams.has(team.name)) {
            progressText = '⏳ Loading...';
        } else if (isCacheValid(team.name) || teamProgress[team.name]) {
            const solvedCount = getTeamSolvedCount(team.name);
            progressText = `${solvedCount}/${totalChallenges}`;
        } else {
            progressText = `📊 Not loaded`;
        }
        
        return `
            <label class="team-checkbox">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTeam('${team.name}', this)">
                <div class="team-color" style="background: ${team.color};"></div>
                <span class="team-name">${team.name}</span>
                <span class="team-progress">${progressText}</span>
            </label>
        `;
    }).join('');
    
    // Afficher le nombre de résultats
    if (searchTerm) {
        container.innerHTML = `<div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">
            ${filteredTeams.length} équipe(s) trouvée(s)</div>` + container.innerHTML;
    }
}

// Fonction de recherche d'équipes
function searchTeams(searchTerm) {
    generateTeamFilters(searchTerm);
}

// Fonction de tri des équipes
function sortTeamsBy(mode) {
    if (mode === 'selected') {
        // Toggle pour afficher seulement les équipes sélectionnées
        showOnlySelected = !showOnlySelected;
        document.getElementById('sort-selected-btn').style.background = showOnlySelected ? '#ef4444' : '#10b981';
        document.getElementById('sort-selected-btn').textContent = showOnlySelected ? '✓ Coché seul' : '✓ Coché';
    } else {
        teamSortMode = mode;
        showOnlySelected = false; // Reset le filtre quand on change de tri
        
        // Mettre à jour l'apparence des boutons
        document.getElementById('sort-score-btn').style.background = mode === 'score' ? '#6366f1' : '#10b981';
        document.getElementById('sort-name-btn').style.background = mode === 'name' ? '#6366f1' : '#10b981';
        document.getElementById('sort-selected-btn').style.background = '#10b981';
        document.getElementById('sort-selected-btn').textContent = '✓ Coché';
        
        // Trier les équipes selon le mode choisi
        if (mode === 'name') {
            teams.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            // Tri par score par défaut
            teams.sort((a, b) => b.score - a.score);
        }
    }
    
    // Régénérer l'affichage
    const searchValue = document.getElementById('team-search')?.value || '';
    generateTeamFilters(searchValue);
}

// ==================== TEAM MANAGEMENT FUNCTIONS ====================
// Enhanced team selection with lazy loading

async function toggleTeam(teamName, checkbox) {
    if (checkbox.checked) {
        // Add team to selection and load its data
        if (!selectedTeams.includes(teamName)) {
            setSelectedTeams([...selectedTeams, teamName]);
        }
        
        try {
            await loadTeamDataLazy(teamName);
            
            // Charger les submissions (fails) de l'équipe
            const team = teams.find(t => t.name === teamName);
            if (team && team.id) {
                await loadTeamSubmissions(team.id);
            }
            
            updateVisualization();
            debugLog(`Team ${teamName} added to view`);
        } catch (error) {
            // Remove from selection if loading failed
            setSelectedTeams(selectedTeams.filter(t => t !== teamName));
            checkbox.checked = false;
            console.error(`Failed to load team ${teamName}`);
        }
    } else {
        // Remove team from selection
        setSelectedTeams(selectedTeams.filter(t => t !== teamName));
        updateVisualization();
        debugLog(`Team ${teamName} removed from view`);
    }
}

function selectAllTeams() {
    if (!userPermissions.canViewAllTeams) return;
    
    const checkboxes = document.querySelectorAll('#team-filters input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const teamName = checkbox.parentElement.querySelector('.team-name').textContent;
        if (!selectedTeams.includes(teamName)) {
            setSelectedTeams([...selectedTeams, teamName]);
        }
    });
    
    // Load all team data
    const loadingPromises = teams.map(team => loadTeamDataLazy(team.name));
    Promise.all(loadingPromises).then(() => {
        updateVisualization();
        debugLog(`All ${teams.length} teams loaded`);
    }).catch(() => {
        debugWarn('Some teams failed to load');
    });
}

function setViewMode(mode) {
    currentViewMode = mode;
    
    // Update button states
    document.querySelectorAll('.control-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Set active button
    if (mode === 'overview') {
        document.querySelector('[onclick="setViewMode(\'overview\')"]').classList.add('active');
    } else if (mode === 'paths') {
        document.getElementById('paths-btn').classList.add('active');
    } else if (mode === 'heatmap') {
        document.getElementById('heatmap-btn').classList.add('active');
    }
    
    // Handle view mode changes
    if (mode === 'paths') {
        parcoursMode = true;
        window.parcoursMode = true;
        heatmapMode = false;
        window.heatmapMode = false;
        debugLog('🛤️ Mode Parcours activé');
        if (d3SystemReady && window.updateTeamPaths) {
            window.updateTeamPaths();
        }
        // Hide heatmap legend
        document.getElementById('heatmap-legend').classList.remove('visible');
    } else if (mode === 'heatmap') {
        heatmapMode = true;
        window.heatmapMode = true;
        parcoursMode = false;
        window.parcoursMode = false;
        debugLog('🔥 Mode Heatmap activé');
        // Clear paths if any
        if (d3SystemReady && window.d3Data && window.d3Data.pathGroup) {
            window.d3Data.pathGroup.selectAll('*').remove();
        }
        // Show heatmap legend
        document.getElementById('heatmap-legend').classList.add('visible');
    } else {
        parcoursMode = false;
        window.parcoursMode = false;
        heatmapMode = false;
        window.heatmapMode = false;
        debugLog('🗂️ Mode Overview activé');
        // Clear paths if any
        if (d3SystemReady && window.d3Data && window.d3Data.pathGroup) {
            window.d3Data.pathGroup.selectAll('*').remove();
        }
        // Hide heatmap legend
        document.getElementById('heatmap-legend').classList.remove('visible');
    }
    
    updateVisualization();
}

function toggleParcours() {
    // Legacy function - redirect to setViewMode
    if (parcoursMode) {
        setViewMode('overview');
    } else {
        setViewMode('paths');
    }
}

function deselectAllTeams() {
    const checkboxes = document.querySelectorAll('#team-filters input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    setSelectedTeams([]);
    updateVisualization();
    debugLog('All teams deselected');
}

function selectSingleTeam() {
    // Prompt user to select which team
    const teamNames = teams.map(t => t.name);
    if (teamNames.length === 0) {
        debugWarn('No teams available');
        return;
    }
    
    // For now, select the first team. In a real implementation, 
    // you might want to show a dropdown or modal
    const selectedTeam = teamNames[0];
    
    // Deselect all first
    deselectAllTeams();
    
    // Select just one team
    setTimeout(() => {
        const checkbox = Array.from(document.querySelectorAll('#team-filters input[type="checkbox"]'))
            .find(cb => cb.parentElement.querySelector('.team-name').textContent === selectedTeam);
        
        if (checkbox) {
            checkbox.checked = true;
            toggleTeam(selectedTeam, checkbox);
        }
    }, 100);
}

function generateChallengeMap() {
    debugLog('=== GÉNÉRATION DE LA CARTE ===');
    debugLog('ChallengeMap entries:', Object.keys(challengeMap).length);
    
    // Skip DOM manipulation if using D3 system
    if (d3SystemReady) {
        debugLog('📊 Using D3 system, skipping legacy DOM generation');
        return;
    }
    
    // Legacy system: create container if needed
    let container = document.getElementById('challenges-container');
    if (!container) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) {
            console.error('❌ map-container not found');
            return;
        }
        
        // Create transform wrapper
        let transformWrapper = document.getElementById('transform-wrapper');
        if (!transformWrapper) {
            transformWrapper = document.createElement('div');
            transformWrapper.id = 'transform-wrapper';
            mapContainer.appendChild(transformWrapper);
        }
        
        // Create challenges container
        container = document.createElement('div');
        container.id = 'challenges-container';
        transformWrapper.appendChild(container);
    }
    container.innerHTML = '';
    
    // DEBUG: Afficher la structure actuelle
    Object.entries(challengeMap).forEach(([id, info]) => {
        debugLog(`${id}: ${info.name} at (${info.position.x}, ${info.position.y}) - deps: [${info.dependencies.join(', ')}]`);
    });

    Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
        // Pour les utilisateurs non-admin, ne montrer que les challenges accessibles
        if (!userPermissions.canViewFutureChalls) {
            const userProgress = getTeamProgress(currentUser.teamName, challengeId);
            if (!userProgress) return; // Challenge non accessible = pas affiché
        }

        const node = document.createElement('div');
        node.className = 'challenge-node';
        node.style.left = challengeInfo.position.x + 'px';
        node.style.top = challengeInfo.position.y + 'px';
        node.style.position = 'absolute'; // S'assurer que la position est absolue
        node.setAttribute('data-challenge', challengeId);
        
        // DEBUG: Afficher les positions lors de la création
        debugLog(`Creating node ${challengeInfo.name}: left=${challengeInfo.position.x}px, top=${challengeInfo.position.y}px`);
        
        const state = getChallengeOverallState(challengeId);
        node.classList.add(`challenge-${state}`);
        
        let statusIcon = '';
        if (state === 'solved') statusIcon = '✓';
        else if (state === 'attempted') statusIcon = '!';
        else if (state === 'available') statusIcon = '○';
        else statusIcon = '🔒';
        
        // Indicateurs par équipe (seulement pour admin)
        let teamIndicators = '';
        if (userPermissions.canViewAllTeams) {
            teamIndicators = `
                <div class="challenge-team-indicator">
                    ${selectedTeams.slice(0, 5).map(teamName => { // Limiter à 5 équipes max pour la lisibilité
                        const team = teams.find(t => t.name === teamName);
                        const progress = getTeamProgress(teamName, challengeId);
                        
                        let dotColor = '#e5e7eb';
                        if (progress?.solved) dotColor = team.color;
                        else if (progress?.attempted) dotColor = '#f59e0b';
                        else if (progress?.locked) dotColor = '#9ca3af';
                        
                        return `<div class="team-mini-dot" style="background: ${dotColor};" title="${teamName}"></div>`;
                    }).join('')}
                </div>
            `;
        }
        
        node.innerHTML = `
            <div class="challenge-name">${truncateText(challengeInfo.name, 18)}</div>
            <div class="challenge-category">${truncateText(challengeInfo.category || 'General', 16)}</div>
            <div class="challenge-points">${challengeInfo.points} pts</div>
            <div class="challenge-status">${statusIcon}</div>
            ${teamIndicators}
        `;
        
        // Apply custom position if available
        if (customPositions[challengeId]) {
            node.style.left = customPositions[challengeId].x + 'px';
            node.style.top = customPositions[challengeId].y + 'px';
            challengeInfo.position = customPositions[challengeId];
        }
        
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            showChallengeSolvesModal(challengeId);
        });
        node.addEventListener('mouseenter', (e) => showTooltip(e, challengeId));
        node.addEventListener('mouseleave', hideTooltip);
        
        // Make node draggable
        makeChallengeNodeDraggable(node, challengeId);
        
        container.appendChild(node);
    });
    
    debugLog('=== NODES CRÉÉS ===');
    debugLog('Nombre de nodes dans le container:', container.children.length);
}

function drawDependencies() {
    const svg = document.getElementById('dependencies-svg');
    if (!svg) {
        console.error('Dependencies SVG element not found');
        return;
    }
    
    // Clear existing arrows but preserve the marker definition
    const existingMarker = svg.querySelector('defs');
    svg.innerHTML = '';
    if (existingMarker) {
        svg.appendChild(existingMarker);
    }
    
    debugLog('🎯 Drawing dependency arrows...');
    
    // 🔧 STEP 1: Calculate required SVG viewport based on challenge positions
    const viewport = calculateSVGViewport();
    debugLog('📐 SVG Viewport calculated:', viewport);
    
    // 🔧 STEP 2: Set proper SVG dimensions and viewBox
    svg.setAttribute('width', viewport.width);
    svg.setAttribute('height', viewport.height);
    svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    
    // 🔧 STEP 3: Add debugging info
    debugLog(`🎯 SVG configured: ${viewport.width}×${viewport.height} viewport`);
    debugLog(`📊 Challenge coordinate range: (${viewport.minX}-${viewport.maxX}, ${viewport.minY}-${viewport.maxY})`);
    
    let arrowCount = 0;
    const arrowCoords = []; // For debugging
    
    // Process each challenge for dependencies
    Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
        if (!challengeInfo.dependencies || challengeInfo.dependencies.length === 0) {
            return; // Skip challenges with no dependencies
        }
        
        challengeInfo.dependencies.forEach(depId => {
            // Find dependency challenge (handle both string and number IDs)
            const depChallenge = challengeMap[String(depId)] || challengeMap[Number(depId)];
            if (!depChallenge) {
                debugWarn(`Dependency ${depId} not found for challenge ${challengeInfo.name}`);
                return;
            }
            
            // Permission check - only show arrows user can see
            if (!userPermissions.canViewAllTeams) {
                const currentUserTeam = currentUser.teamName;
                const hasAccessToCurrent = getTeamProgress(currentUserTeam, challengeId);
                const hasAccessToDep = getTeamProgress(currentUserTeam, String(depId)) || 
                                     getTeamProgress(currentUserTeam, Number(depId));
                
                if (!hasAccessToCurrent || !hasAccessToDep) {
                    return; // Skip if user can't see both challenges
                }
            }
            
            // Validate positions
            const depPos = depChallenge.position;
            const curPos = challengeInfo.position;
            
            if (!depPos || !curPos || 
                typeof depPos.x !== 'number' || typeof depPos.y !== 'number' ||
                typeof curPos.x !== 'number' || typeof curPos.y !== 'number') {
                return; // Skip if invalid positions
            }
            
            // Calculate clean arrow coordinates (center to center)
            const startX = depPos.x + 70; // Center of source challenge
            const startY = depPos.y + 40; // Center of source challenge
            const endX = curPos.x + 70;   // Center of target challenge  
            const endY = curPos.y + 40;   // Center of target challenge
            
            // 🔧 STEP 4: Debug arrow coordinates
            arrowCoords.push({
                from: depChallenge.name,
                to: challengeInfo.name,
                coords: { startX, startY, endX, endY },
                inViewport: startX >= 0 && startX <= viewport.width && 
                           startY >= 0 && startY <= viewport.height &&
                           endX >= 0 && endX <= viewport.width && 
                           endY >= 0 && endY <= viewport.height
            });
            
            // Create simple, clean arrow line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.classList.add('dependency-arrow');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            
            // Add metadata for tooltips/debugging
            line.setAttribute('data-from', depChallenge.name);
            line.setAttribute('data-to', challengeInfo.name);
            line.setAttribute('data-coords', `(${startX},${startY})→(${endX},${endY})`);
            
            svg.appendChild(line);
            arrowCount++;
        });
    });
    
    // 🔧 STEP 5: Debug arrow visibility
    const clippedArrows = arrowCoords.filter(arrow => !arrow.inViewport);
    if (clippedArrows.length > 0) {
        debugWarn(`⚠️ ${clippedArrows.length} arrows may be clipped:`);
        clippedArrows.forEach(arrow => {
            debugWarn(`  ${arrow.from} → ${arrow.to}: (${arrow.coords.startX},${arrow.coords.startY})→(${arrow.coords.endX},${arrow.coords.endY})`);
        });
    }
    
    debugLog(`✅ Created ${arrowCount} dependency arrows in ${viewport.width}×${viewport.height} viewport`);
    debugLog(`📊 Arrow visibility: ${arrowCount - clippedArrows.length}/${arrowCount} visible, ${clippedArrows.length} potentially clipped`);
    
    // 🎯 FINAL DEBUG INFO\n    debugLog(`\ud83d\udd0d SVG Debug Summary:`);\n    debugLog(`  📐 SVG Dimensions: ${svg.getAttribute('width')}×${svg.getAttribute('height')}`);\n    debugLog(`  📊 ViewBox: ${svg.getAttribute('viewBox')}`);\n    debugLog(`  🗺️ Challenge Range: (${viewport.minX}-${viewport.maxX}, ${viewport.minY}-${viewport.maxY})`);\n    debugLog(`  🎯 Total Challenges: ${Object.keys(challengeMap).length}`);\n    debugLog(`  ➡️ Total Arrows: ${arrowCount}`);\n    \n    // Ensure SVG transform is synchronized with challenge container
    updateTransform();
}

// 🔧 NEW FUNCTION: Calculate the required SVG viewport to contain all challenges
function calculateSVGViewport() {
    const challenges = Object.values(challengeMap);
    
    if (challenges.length === 0) {
        return { width: 1400, height: 1000, minX: 0, maxX: 1400, minY: 0, maxY: 1000 };
    }
    
    // Find coordinate bounds of all challenges
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    challenges.forEach(challenge => {
        if (challenge.position && 
            typeof challenge.position.x === 'number' && 
            typeof challenge.position.y === 'number') {
            
            // Challenge dimensions: 140×80
            const left = challenge.position.x;
            const right = challenge.position.x + 140;
            const top = challenge.position.y;
            const bottom = challenge.position.y + 80;
            
            minX = Math.min(minX, left);
            maxX = Math.max(maxX, right);
            minY = Math.min(minY, top);
            maxY = Math.max(maxY, bottom);
        }
    });
    
    // Add padding for arrows and margins (arrows extend from challenge centers)
    const padding = 100;
    const finalMinX = Math.max(0, minX - padding);
    const finalMinY = Math.max(0, minY - padding);
    const finalMaxX = maxX + padding;
    const finalMaxY = maxY + padding;
    
    // Ensure minimum size (match transform-wrapper minimums)
    const width = Math.max(1400, finalMaxX - finalMinX);
    const height = Math.max(1000, finalMaxY - finalMinY);
    
    return {
        width: Math.ceil(width),
        height: Math.ceil(height),
        minX: finalMinX,
        maxX: finalMaxX,
        minY: finalMinY,
        maxY: finalMaxY
    };
}

function getTeamProgress(teamName, challengeId) {
    return teamProgress[teamName]?.[challengeId];
}

function getChallengeOverallState(challengeId) {
    if (!userPermissions.canViewAllTeams) {
        // Mode utilisateur : état basé sur cette équipe seulement
        const progress = getTeamProgress(currentUser.teamName, challengeId);
        if (!progress) return 'hidden';
        if (progress.solved) return 'solved';
        if (progress.attempted) return 'attempted';
        if (progress.locked) return 'locked';
        return 'available';
    }

    // Mode admin : état basé sur toutes les équipes sélectionnées
    const hasAnyResolved = selectedTeams.some(team => 
        getTeamProgress(team, challengeId)?.solved
    );
    if (hasAnyResolved) return 'solved';
    
    const hasAnyAttempted = selectedTeams.some(team => 
        getTeamProgress(team, challengeId)?.attempted
    );
    if (hasAnyAttempted) return 'attempted';
    
    const hasAnyAvailable = selectedTeams.some(team => {
        const progress = getTeamProgress(team, challengeId);
        return progress && !progress.locked;
    });
    return hasAnyAvailable ? 'available' : 'locked';
}

function getTeamSolvedCount(teamName) {
    if (!teamProgress[teamName]) return 0;
    return Object.values(teamProgress[teamName]).filter(p => p.solved === true).length;
}

function showTooltip(event, challengeId) {
    const tooltip = document.getElementById('tooltip');
    const challengeInfo = challengeMap[challengeId];
    
    if (!userPermissions.canViewAllTeams) {
        const progress = getTeamProgress(currentUser.teamName, challengeId);
        
        let content = `<strong>${challengeInfo.name}</strong><br>Points: ${challengeInfo.points}<br><br>`;
        
        if (progress?.solved) {
            const failures = Math.max(0, (progress.attempts || 1) - 1);
            content += `✅ <strong>Résolu !</strong><br>Temps: ${progress.timeSpent}min<br>Tentatives: ${progress.attempts || 1}`;
            if (failures > 0) content += `<br>Échecs: ${failures}`;
        } else if (progress?.attempted) {
            content += `⚠️ <strong>Tenté</strong><br>Temps: ${progress.timeSpent}min<br>Tentatives: ${progress.attempts || 1}<br>Échecs: ${progress.attempts || 1}`;
        } else {
            content += `📝 <strong>Disponible</strong><br>Prêt à être tenté`;
        }
        
        tooltip.innerHTML = content;
    } else {
        // Mode admin : affichage complet
        const solvedTeams = selectedTeams.filter(team => 
            getTeamProgress(team, challengeId)?.solved
        );
        const attemptedTeams = selectedTeams.filter(team => 
            getTeamProgress(team, challengeId)?.attempted && !getTeamProgress(team, challengeId)?.solved
        );
        
        let content = `<strong>${challengeInfo.name}</strong><br>Points: ${challengeInfo.points}<br><br>`;
        
        if (solvedTeams.length > 0) {
            content += `✅ <strong>Résolu par:</strong><br>`;
            solvedTeams.forEach(team => {
                const progress = getTeamProgress(team, challengeId);
                content += `• ${team} (${progress.timeSpent}min, ${progress.attempts || 1} tent.)<br>`;
            });
        }
        
        if (attemptedTeams.length > 0) {
            content += `<br>⚠️ <strong>Tenté par:</strong><br>`;
            attemptedTeams.forEach(team => {
                const progress = getTeamProgress(team, challengeId);
                content += `• ${team} (${progress.timeSpent}min, ${progress.attempts || 1} tent.)<br>`;
            });
        }
        
        tooltip.innerHTML = content;
    }
    
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(event.pageX + 10, window.innerWidth - 320) + 'px';
    tooltip.style.top = Math.min(event.pageY + 10, window.innerHeight - 200) + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.display = 'none';
}

// ===== FONCTIONS DE STATISTIQUES =====


function updateVisualization() {
    generateChallengeMap();
    
    // Use D3 rendering if available and ready, fallback to legacy system
    if (d3SystemReady && window.renderD3Challenges && typeof isD3Ready === 'function' && isD3Ready()) {
        try {
            renderD3Challenges();
            // Update team paths if parcours mode is active
            if (parcoursMode && window.updateTeamPaths) {
                setTimeout(() => window.updateTeamPaths(), 100); // Small delay to ensure nodes are positioned
            }
        } catch (error) {
            console.error('❌ D3 rendering failed:', error);
            debugLog('🔄 Falling back to legacy rendering');
            drawDependencies();
            updateTransform(); // Ensure SVG follows challenge container
        }
    } else {
        drawDependencies();
        updateTransform(); // Ensure SVG follows challenge container
    }
    
    generateTeamFilters();
    updateGlobalStats();
    updateLiveStats();
}

function updateGlobalStats() {
    const totalChallenges = Object.keys(challengeMap).length;
    
    if (!userPermissions.canViewAllTeams) {
        const solvedCount = getTeamSolvedCount(currentUser.teamName);
        const attemptedCount = Object.values(teamProgress[currentUser.teamName] || {}).filter(p => p.attempted).length;
        
        document.getElementById('global-stats').innerHTML = `
            <div class="stat-item"><span>Votre progression:</span><span>${solvedCount}/${totalChallenges}</span></div>
            <div class="stat-item"><span>Challenges tentés:</span><span>${attemptedCount}</span></div>
            <div class="stat-item"><span>Points obtenus:</span><span>${calculateTeamScore(currentUser.teamName)}</span></div>
        `;
    } else {
        const totalSolved = selectedTeams.reduce((sum, team) => sum + getTeamSolvedCount(team), 0);
        const avgProgress = selectedTeams.length > 0 ? 
            ((totalSolved / (selectedTeams.length * totalChallenges)) * 100).toFixed(1) : 0;
        
        document.getElementById('global-stats').innerHTML = `
            <div class="stat-item"><span>Challenges totaux:</span><span>${totalChallenges}</span></div>
            <div class="stat-item"><span>Équipes actives:</span><span>${selectedTeams.length}</span></div>
            <div class="stat-item"><span>Progression moyenne:</span><span>${avgProgress}%</span></div>
        `;
    }
}

function updateLiveStats() {
    if (!userPermissions.canViewAllTeams) {
        const progress = teamProgress[currentUser.teamName] || {};
        const latestChallenge = Object.entries(progress)
            .filter(([id, p]) => p.solved)
            .sort(([,a], [,b]) => (b.timeSpent || 0) - (a.timeSpent || 0))[0];
        
        document.getElementById('live-stats').innerHTML = `
            <div class="stat-item"><span>Votre équipe:</span><span>${currentUser.teamName}</span></div>
            <div class="stat-item"><span>Dernier résolu:</span><span>${latestChallenge ? challengeMap[latestChallenge[0]]?.name.substring(0, 15) + '...' : 'Aucun'}</span></div>
            <div class="stat-item"><span>Mode de vue:</span><span>${currentViewMode}</span></div>
        `;
    } else {
        if (selectedTeams.length === 0) {
            document.getElementById('live-stats').innerHTML = `
                <div class="stat-item"><span>Aucune équipe sélectionnée</span><span>-</span></div>
            `;
            return;
        }
        
        const leadingTeam = selectedTeams.reduce((leader, team) => {
            const teamScore = getTeamSolvedCount(team);
            const leaderScore = getTeamSolvedCount(leader);
            return teamScore > leaderScore ? team : leader;
        }, selectedTeams[0]);
        
        document.getElementById('live-stats').innerHTML = `
            <div class="stat-item"><span>Équipe en tête:</span><span>${leadingTeam}</span></div>
            <div class="stat-item"><span>Mode connecté:</span><span>Admin</span></div>
            <div class="stat-item"><span>Mode de vue:</span><span>${currentViewMode}</span></div>
        `;
    }
}

function calculateTeamScore(teamName) {
    if (!teamProgress[teamName]) return 0;
    return Object.entries(teamProgress[teamName])
        .filter(([id, progress]) => progress.solved)
        .reduce((sum, [id, progress]) => sum + (challengeMap[id]?.points || 0), 0);
}

function updateAPIStatus(status, message) {
    const indicator = document.getElementById('api-indicator');
    const text = document.getElementById('api-status-text');
    const urlDisplay = document.getElementById('ctfd-url-display');
    
    indicator.className = `status-indicator status-${status}`;
    text.textContent = message;
    
    // Afficher l'URL du CTFd si connecté
    if ((status === 'connected' || status === 'proxy') && currentUser.ctfdUrl && urlDisplay) {
        urlDisplay.textContent = `📍 ${currentUser.ctfdUrl}`;
        urlDisplay.style.display = 'block';
    } else if (urlDisplay) {
        urlDisplay.textContent = '';
        urlDisplay.style.display = 'none';
    }
    
    if (status === 'connected') {
        hideError();
        isConnected = true;
    } else if (status === 'proxy') {
        // Proxy actif mais pas encore connecté à CTFd
        hideError();
        isConnected = false;
    } else if (status === 'proxy-down') {
        // Proxy non démarré
        isConnected = false;
    } else {
        isConnected = false;
    }
}

function showCORSError() {
    const errorElement = document.getElementById('api-error');
    if (!errorElement) return;
    
    errorElement.innerHTML = 
`<strong>🚫 Erreur CORS détectée</strong><br><br>
Le serveur CTFd ne permet pas les requêtes cross-origin depuis cette page.<br><br>
<strong>Solutions possibles :</strong><br>
1. <strong>Proxy CORS :</strong> Utilisez un proxy comme <code>https://cors-anywhere.herokuapp.com/</code><br>
2. <strong>Extension navigateur :</strong> Installez "CORS Unblock" ou "CORS Toggle"<br>
3. <strong>Serveur local :</strong> Hébergez cette page sur le même domaine que CTFd<br>
4. <strong>Configuration CTFd :</strong> Ajoutez les headers CORS dans CTFd<br><br>
<button class="demo-btn" onclick="useCORSProxy()">🔧 Essayer avec proxy CORS</button>
<button class="demo-btn" onclick="showCORSInstructions()">📖 Instructions détaillées</button>`;
    
    errorElement.style.display = 'block';
}

function useCORSProxy() {
    const currentUrl = document.getElementById('ctfd-url').value.trim();
    if (currentUrl && !currentUrl.startsWith('https://cors-anywhere.herokuapp.com/')) {
        document.getElementById('ctfd-url').value = 'https://cors-anywhere.herokuapp.com/' + currentUrl;
        debugLog('URL modifiée pour utiliser le proxy CORS. Cliquez sur "Se connecter" pour réessayer.');
    } else {
        debugWarn('Ajoutez d\'abord une URL CTFd valide.');
    }
}

function showQuickSetup() {
    const instructions = 
`⚡ INSTALLATION RAPIDE - 3 OPTIONS

🥇 OPTION 1 : Extension Chrome/Firefox (30 secondes)
1. Installez "Allow CORS" ou "CORS Unblock"
2. Ouvrez ce fichier HTML directement
3. Activez l'extension et connectez-vous
✅ Avantage : Ultra rapide, aucune installation

🥈 OPTION 2 : Proxy Node.js (2 minutes) 
1. Dans le dossier du projet :
   npm install
   CTFD_URL=https://votre-ctfd.com npm start
   
2. Ouvrez http://localhost:3000/index.html
✅ Avantage : Pas besoin d'extension, plus sécurisé

🥉 OPTION 3 : Serveur Python + Extension
1. python -m http.server 8000
2. Installez une extension CORS
3. Ouvrez http://localhost:8000/index.html
✅ Avantage : Simple si Python déjà installé

🔐 OBTENIR UN TOKEN API :
1. Connectez-vous à CTFd
2. Settings → Access Tokens → Create
3. Copiez le token (ctf_xxxxxxxxx)

🚀 Conseil : Commencez par l'Option 1 !`;
    
    debugLog(instructions);
}


function hideError() {
    document.getElementById('api-error').style.display = 'none';
}

function refreshData() {
    if (!isConnected) return;
    
    updateAPIStatus('loading', 'Actualisation...');
    
    // Actualiser les données via l'API CTFd
    setTimeout(async () => {
        try {
            await loadDataBasedOnPermissions();
            updateVisualization();
            updateAPIStatus('connected', `${userPermissions.isAdmin ? 'Admin' : 'Équipe'} connecté`);
        } catch (error) {
            console.error('Erreur actualisation:', error);
            updateAPIStatus('disconnected', 'Erreur d\'actualisation');
            showError('Erreur lors de l\'actualisation: ' + error.message);
        }
    }, 1000);
}

function logout() {
    // Arrêter immédiatement toute connexion
    isConnected = false;
    
    // Nettoyer toutes les variables d'état
    currentUser = { name: null, token: null, ctfdUrl: null, teamName: null, id: null };
    teams = [];
    window.teams = [];
    teamProgress = {};
    window.teamProgress = {};
    challenges = {}; // Réinitialiser les challenges
    challengeMap = {}; // Réinitialiser la map des challenges
    setSelectedTeams([]);
    userPermissions = { canViewAllTeams: false, canViewFutureChalls: false, isAdmin: false };
    
    // Vider tous les caches
    teamDataCache = {};
    challengeAttemptsCache = {};
    teamSubmissionsCache = {};
    loadingTeams.clear();
    
    // Nettoyer le stockage local/session si nécessaire
    try {
        // Ne pas supprimer CTFDMAP_DEBUG mais nettoyer les données de cache potentielles
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('ctfd_') || key.startsWith('challenges_') || key.startsWith('teams_'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        debugLog('LocalStorage nettoyé:', keysToRemove);
    } catch (error) {
        debugLog('Erreur nettoyage localStorage:', error);
    }
    
    // Réinitialiser les variables D3 et de vue
    currentViewMode = 'overview';
    window.heatmapMode = false;
    heatmapMode = false;
    
    // Nettoyer la visualisation D3
    try {
        // Utiliser la fonction de nettoyage dédiée depuis app-d3.js
        if (typeof clearD3Visualization === 'function') {
            clearD3Visualization();
        } else {
            // Fallback si la fonction n'est pas disponible
            if (typeof d3Data !== 'undefined') {
                d3Data.nodes = [];
                d3Data.links = [];
                if (d3Data.simulation) {
                    d3Data.simulation.stop();
                }
            }
            
            const svg = d3.select('#visualization');
            if (svg && !svg.empty()) {
                svg.selectAll('*').remove();
            }
        }
        debugLog('Visualisation D3 nettoyée');
    } catch (error) {
        debugLog('Erreur lors du nettoyage D3:', error);
    }
    
    // Nettoyer l'interface utilisateur
    try {
        // Vider la liste des équipes
        const teamsList = document.getElementById('teams-list');
        if (teamsList) {
            teamsList.innerHTML = '';
        }
        
        // Réinitialiser les variables de filtre et tri
        window.teamSortMode = 'score';
        window.showOnlySelected = false;
        window.teamSearchTerm = '';
        
        // Réinitialiser les boutons/sections admin
        const adminSections = document.querySelectorAll('.admin-only');
        adminSections.forEach(section => section.classList.add('admin-only'));
        
        // Cacher les éléments de données
        document.getElementById('teams-section').style.display = 'block';
        
        debugLog('Interface utilisateur nettoyée');
    } catch (error) {
        debugLog('Erreur lors du nettoyage UI:', error);
    }
    
    // Mettre à jour les références globales du cache (après nettoyage)
    window.challengeAttemptsCache = challengeAttemptsCache;
    window.teamSubmissionsCache = teamSubmissionsCache;
    window.teams = teams;
    window.teamProgress = teamProgress;
    window.selectedTeams = selectedTeams;
    
    debugLog('🧹 Logout complet - toutes les données nettoyées');
    
    document.getElementById('container').style.display = 'none';
    document.getElementById('login-modal').style.display = 'flex';
    updateAPIStatus('disconnected', 'Déconnecté');
    
    // Reset form - garder l'URL saisie par l'utilisateur
    document.getElementById('api-token').value = '';
}

// Fonction pour calculer le niveau hiérarchique d'un challenge avec logique top-down correcte
// Level 0 = ROOT/TOP challenges (NO dependencies)
// Level 1 = Challenges that depend on Level 0 challenges
// Level 2 = Challenges that depend on Level 1 challenges, etc.
function calculateChallengeLevel(challengeId, challengeMap, levels = {}, visited = new Set(), depth = 0) {
    // Add depth tracking to detect deep recursion
    const indent = '  '.repeat(depth);
    
    // Convertir en string pour assurer la cohérence
    const chalId = String(challengeId);
    
    debugLog(`${indent}🔍 CALCULATING LEVEL for ${chalId} (depth: ${depth})`);
    
    // Si déjà calculé, retourner le niveau
    if (levels[chalId] !== undefined) {
        debugLog(`${indent}📋 ${chalId} already calculated → Level ${levels[chalId]}`);
        return levels[chalId];
    }
    
    // Éviter les cycles infinis
    if (visited.has(chalId)) {
        debugWarn(`${indent}🔄 CYCLE DETECTED for ${chalId} - treating as root`);
        levels[chalId] = 0; // Traiter comme racine en cas de cycle
        return 0;
    }
    
    // Prevent extremely deep recursion
    if (depth > 50) {
        console.error(`${indent}⛔ MAX DEPTH REACHED for ${chalId} - treating as root`);
        levels[chalId] = 0;
        return 0;
    }
    
    visited.add(chalId);
    debugLog(`${indent}📝 Added ${chalId} to visited set: [${Array.from(visited).join(', ')}]`);
    
    const challenge = challengeMap[chalId] || challengeMap[Number(chalId)];
    if (!challenge) {
        debugWarn(`${indent}❌ Challenge ${chalId} not found in challengeMap`);
        debugLog(`${indent}📚 Available challenges: [${Object.keys(challengeMap).join(', ')}]`);
        levels[chalId] = 0;
        visited.delete(chalId);
        return 0;
    }
    
    debugLog(`${indent}📊 Challenge: ${challenge.name}`);
    debugLog(`${indent}📊 Dependencies: [${(challenge.dependencies || []).join(', ')}]`);
    debugLog(`${indent}📊 Dependency count: ${(challenge.dependencies || []).length}`);
    
    // ✅ LEVEL 0: Challenges WITHOUT dependencies = ROOT/TOP of tree
    if (!challenge.dependencies || challenge.dependencies.length === 0) {
        levels[chalId] = 0;
        debugLog(`${indent}🌱 ROOT CHALLENGE: ${challenge.name} → Level 0 (no dependencies)`);
        visited.delete(chalId);
        debugLog(`${indent}📝 Removed ${chalId} from visited set`);
        return 0;
    }
    
    // Pour les autres challenges: niveau = max des niveaux des dépendances + 1
    let maxDependencyLevel = -1;
    let validDependencies = 0;
    
    debugLog(`${indent}🔗 Processing ${challenge.dependencies.length} dependencies for ${challenge.name}:`);
    
    for (let i = 0; i < challenge.dependencies.length; i++) {
        const depId = challenge.dependencies[i];
        const depKey = String(depId);
        
        debugLog(`${indent}  [${i+1}/${challenge.dependencies.length}] Processing dependency: ${depId} → ${depKey}`);
        
        const dependencyChallenge = challengeMap[depKey] || challengeMap[Number(depKey)];
        
        if (dependencyChallenge) {
            debugLog(`${indent}  ✅ Found dependency challenge: ${dependencyChallenge.name}`);
            debugLog(`${indent}  🔄 Recursively calculating level for dependency ${depKey}...`);
            
            const depLevel = calculateChallengeLevel(depKey, challengeMap, levels, visited, depth + 1);
            
            debugLog(`${indent}  📊 Dependency ${dependencyChallenge.name} has level: ${depLevel}`);
            maxDependencyLevel = Math.max(maxDependencyLevel, depLevel);
            validDependencies++;
            
            debugLog(`${indent}  📈 Updated max dependency level: ${maxDependencyLevel} (valid deps: ${validDependencies})`);
        } else {
            debugWarn(`${indent}  ⚠️ Dependency ${depId} not found for ${challenge.name}`);
            debugLog(`${indent}  🔍 Searched for: '${depKey}' and '${Number(depKey)}'`);
            debugLog(`${indent}  🗂️ Available challenge keys: [${Object.keys(challengeMap).slice(0, 10).join(', ')}${Object.keys(challengeMap).length > 10 ? '...' : ''}]`);
        }
    }
    
    debugLog(`${indent}📊 Dependency analysis complete for ${challenge.name}:`);
    debugLog(`${indent}  - Valid dependencies: ${validDependencies}`);
    debugLog(`${indent}  - Max dependency level: ${maxDependencyLevel}`);
    
    // Si aucune dépendance valide, traiter comme racine
    if (validDependencies === 0) {
        levels[chalId] = 0;
        debugLog(`${indent}🌱 FALLBACK ROOT: ${challenge.name} → Level 0 (no valid dependencies)`);
        visited.delete(chalId);
        debugLog(`${indent}📝 Removed ${chalId} from visited set`);
        return 0;
    }
    
    // ✅ HIERARCHY: Level = max dependency level + 1
    const calculatedLevel = maxDependencyLevel + 1;
    levels[chalId] = calculatedLevel;
    
    debugLog(`${indent}🎯 HIERARCHICAL: ${challenge.name} → Level ${calculatedLevel} (max deps level: ${maxDependencyLevel} + 1)`);
    
    visited.delete(chalId); // Retirer de visited pour permettre d'autres calculs
    debugLog(`${indent}📝 Removed ${chalId} from visited set`);
    
    return calculatedLevel;
}

async function buildChallengeMapFromCTFd(ctfdChallenges) {
    // Reconstruire challengeMap à partir des données CTFd
    
    if (!ctfdChallenges || ctfdChallenges.length === 0) {
        debugWarn('Aucun challenge reçu de CTFd, utilisation des données de démo');
        return;
    }
    
    debugLog('=== CONSTRUCTION DE LA CARTE DES CHALLENGES ===');
    debugLog(`Nombre de challenges reçus: ${ctfdChallenges.length}`);
    
    // Si on a des challenges, on remplace le challengeMap par défaut
    challengeMap = {};
    
    // Étape 1: Créer tous les challenges sans dépendances
    ctfdChallenges.forEach(challenge => {
        // Debug: afficher la structure complète
        debugLog(`Challenge: ${challenge.name} (ID: ${challenge.id})`);
        debugLog(`  - Category: ${challenge.category}`);
        debugLog(`  - Value: ${challenge.value}`);
        
        // Utiliser l'ID comme clé string pour éviter les problèmes
        const challengeId = String(challenge.id);
        
        challengeMap[challengeId] = {
            ctfd_id: challenge.id,
            name: challenge.name,
            position: { x: 0, y: 0 },
            dependencies: [], // Sera rempli à l'étape 2
            points: challenge.value,
            category: challenge.category || 'default',
            state: challenge.state || 'visible'
        };
    });
    
    // Étape 2: Fetch les requirements pour chaque challenge
    debugLog('=== 🔍 DETAILED DEPENDENCY FETCHING DEBUG ===');
    debugLog(`Attempting to fetch dependencies for ${ctfdChallenges.length} challenges...`);
    debugLog('Current CTFd URL:', currentUser.ctfdUrl);
    debugLog('Token available:', !!currentUser.token);
    
    // First, log the structure of a sample challenge to understand available fields
    if (ctfdChallenges.length > 0) {
        debugLog('📋 SAMPLE CHALLENGE STRUCTURE:');
        const sampleChallenge = ctfdChallenges[0];
        debugLog('Available fields:', Object.keys(sampleChallenge));
        debugLog('Full sample challenge data:', sampleChallenge);
        
        // Check for common requirement field names
        const possibleRequirementFields = ['requirements', 'prerequisites', 'depends_on', 'dependencies'];
        possibleRequirementFields.forEach(field => {
            if (sampleChallenge[field] !== undefined) {
                debugLog(`🎯 Found potential requirement field '${field}':`, sampleChallenge[field]);
            }
        });
    }
    
    const requirementPromises = ctfdChallenges.map(async (challenge) => {
        const challengeId = String(challenge.id);
        
        debugLog(`\n📡 FETCHING REQUIREMENTS: ${challenge.name} (ID: ${challenge.id})`);
        debugLog(`  - Challenge category: ${challenge.category}`);
        debugLog(`  - Challenge value: ${challenge.value}`);
        debugLog(`  - Challenge state: ${challenge.state}`);
        
        // Check if challenge already has requirements in the initial data
        const possibleRequirementFields = ['requirements', 'prerequisites', 'depends_on', 'dependencies'];
        let foundDirectRequirements = false;
        
        possibleRequirementFields.forEach(field => {
            if (challenge[field] !== undefined && challenge[field] !== null) {
                debugLog(`  🎯 DIRECT REQUIREMENT FIELD '${field}' found:`, challenge[field]);
                foundDirectRequirements = true;
            }
        });
        
        try {
            // Try the requirements endpoint first
            const requirementsEndpoint = `/api/v1/challenges/${challenge.id}/requirements`;
            debugLog(`  📞 Calling endpoint: ${requirementsEndpoint}`);
            
            const requirementsResponse = await callCTFdAPI(requirementsEndpoint);
            
            debugLog(`  📦 RAW RESPONSE for ${challenge.name}:`);
            debugLog(`    - Success: ${requirementsResponse.success}`);
            debugLog(`    - Data type: ${typeof requirementsResponse.data}`);
            debugLog(`    - Data is array: ${Array.isArray(requirementsResponse.data)}`);
            debugLog(`    - Data length: ${requirementsResponse.data ? requirementsResponse.data.length : 'N/A'}`);
            debugLog(`    - Full data:`, requirementsResponse.data);
            debugLog(`    - Full response:`, requirementsResponse);
            
            // Check if response data is a direct array (legacy format)
            if (requirementsResponse.data && Array.isArray(requirementsResponse.data)) {
                const requirements = requirementsResponse.data.map(req => {
                    debugLog(`    🔗 Processing requirement item:`, req, `(type: ${typeof req})`);
                    return String(req);
                });
                challengeMap[challengeId].dependencies = requirements;
                
                debugLog(`  ✅ ${challenge.name}: API Requirements found (direct array): [${requirements.join(', ')}]`);
                
                return { challengeId, requirements, source: 'api' };
            }
            // Check if response data is an object with prerequisites property (CTFd format)
            else if (requirementsResponse.data && typeof requirementsResponse.data === 'object' && 
                     requirementsResponse.data.prerequisites && Array.isArray(requirementsResponse.data.prerequisites)) {
                const requirements = requirementsResponse.data.prerequisites.map(req => {
                    debugLog(`    🔗 Processing prerequisite item:`, req, `(type: ${typeof req})`);
                    return String(req);
                });
                challengeMap[challengeId].dependencies = requirements;
                
                debugLog(`  ✅ ${challenge.name}: API Prerequisites found: [${requirements.join(', ')}]`);
                
                return { challengeId, requirements, source: 'api' };
            }
            // Handle single prerequisite in object format
            else if (requirementsResponse.data && typeof requirementsResponse.data === 'object' && 
                     requirementsResponse.data.prerequisites !== undefined && requirementsResponse.data.prerequisites !== null) {
                const singlePrereq = requirementsResponse.data.prerequisites;
                const requirements = [String(singlePrereq)];
                challengeMap[challengeId].dependencies = requirements;
                
                debugLog(`  ✅ ${challenge.name}: Single prerequisite found: [${requirements.join(', ')}]`);
                
                return { challengeId, requirements, source: 'api' };
            }
            // Handle other response formats
            else if (requirementsResponse.data !== null && requirementsResponse.data !== undefined) {
                debugLog(`  ⚠️ ${challenge.name}: Non-standard response from requirements API:`);
                debugLog(`    - Type: ${typeof requirementsResponse.data}`);
                debugLog(`    - Value:`, requirementsResponse.data);
                
                // Try to convert single value to array
                if (typeof requirementsResponse.data === 'string' || typeof requirementsResponse.data === 'number') {
                    const requirements = [String(requirementsResponse.data)];
                    challengeMap[challengeId].dependencies = requirements;
                    debugLog(`  🔄 ${challenge.name}: Converted single requirement to array: [${requirements.join(', ')}]`);
                    return { challengeId, requirements, source: 'api-converted' };
                }
            }
            
            debugLog(`  ❌ ${challenge.name}: Empty or invalid requirements API response`);
            
        } catch (error) {
            console.error(`  💥 ${challenge.name}: API ERROR when fetching requirements:`);
            console.error(`    - Error type: ${error.constructor.name}`);
            console.error(`    - Error message: ${error.message}`);
            console.error(`    - Error status: ${error.status}`);
            console.error(`    - Full error:`, error);
            
            // Check if it's a 404 (endpoint doesn't exist) vs other errors
            if (error.status === 404) {
                debugLog(`    🚫 Requirements endpoint not available for this CTFd instance`);
                debugLog(`    🔄 Trying alternative endpoints...`);
                
                // Try alternative endpoints that might exist in different CTFd versions
                const alternativeEndpoints = [
                    `/api/v1/challenges/${challenge.id}/prerequisites`,
                    `/api/v1/challenges/${challenge.id}/dependencies`,
                    `/api/v1/challenges/${challenge.id}` // Get full challenge details
                ];
                
                let foundAlternative = false;
                for (const altEndpoint of alternativeEndpoints) {
                    try {
                        debugLog(`    📞 Trying alternative: ${altEndpoint}`);
                        const altResponse = await callCTFdAPI(altEndpoint);
                        
                        if (altResponse.data) {
                            debugLog(`    ✅ Alternative endpoint success:`, altResponse.data);
                            
                            // Check if this endpoint returns dependencies in different formats
                            const altData = altResponse.data;
                            let altRequirements = [];
                            
                            if (Array.isArray(altData)) {
                                altRequirements = altData.map(req => String(req));
                            } else if (altData.requirements) {
                                altRequirements = Array.isArray(altData.requirements) ? 
                                    altData.requirements.map(req => String(req)) : [String(altData.requirements)];
                            } else if (altData.prerequisites) {
                                altRequirements = Array.isArray(altData.prerequisites) ? 
                                    altData.prerequisites.map(req => String(req)) : [String(altData.prerequisites)];
                            } else if (altData.dependencies) {
                                altRequirements = Array.isArray(altData.dependencies) ? 
                                    altData.dependencies.map(req => String(req)) : [String(altData.dependencies)];
                            }
                            
                            if (altRequirements.length > 0) {
                                challengeMap[challengeId].dependencies = altRequirements;
                                debugLog(`    🎯 Found dependencies via ${altEndpoint}: [${altRequirements.join(', ')}]`);
                                foundAlternative = true;
                                return { challengeId, requirements: altRequirements, source: `alternative-${altEndpoint}` };
                            }
                        }
                    } catch (altError) {
                        debugLog(`    ❌ Alternative ${altEndpoint} failed:`, altError.message);
                    }
                }
                
                if (!foundAlternative) {
                    debugLog(`    🚫 No alternative endpoints worked`);
                }
                
            } else if (error.status === 403) {
                debugLog(`    🔒 Access denied to requirements endpoint`);
            } else if (error.status === 401) {
                debugLog(`    🔑 Authentication failed - token may be invalid`);
            } else {
                debugLog(`    🌐 Network or server error`);
            }
        }
        
        // Fallback: check direct challenge properties
        debugLog(`  🔄 ${challenge.name}: Attempting fallback to direct challenge properties...`);
        
        let fallbackRequirements = [];
        possibleRequirementFields.forEach(field => {
            if (challenge[field] !== undefined && challenge[field] !== null) {
                debugLog(`    📋 Found fallback field '${field}':`, challenge[field]);
                if (Array.isArray(challenge[field])) {
                    fallbackRequirements = challenge[field].map(req => String(req));
                } else if (typeof challenge[field] === 'string' || typeof challenge[field] === 'number') {
                    fallbackRequirements = [String(challenge[field])];
                }
                debugLog(`    🎯 Processed fallback requirements: [${fallbackRequirements.join(', ')}]`);
            }
        });
        
        challengeMap[challengeId].dependencies = fallbackRequirements;
        
        debugLog(`  📝 ${challenge.name}: Final dependencies: [${fallbackRequirements.join(', ')}] (source: fallback)`);
        
        return { challengeId, requirements: fallbackRequirements, source: 'fallback' };
    });
    
    // Attendre toutes les requêtes de requirements
    debugLog('\n⏳ Waiting for all requirement requests to complete...');
    const allRequirements = await Promise.all(requirementPromises);
    
    // Analyze the results
    debugLog('\n📊 DEPENDENCY FETCHING SUMMARY:');
    const sourceCounts = { api: 0, 'api-converted': 0, fallback: 0 };
    const totalDependencies = allRequirements.reduce((total, req) => {
        sourceCounts[req.source] = (sourceCounts[req.source] || 0) + 1;
        return total + req.requirements.length;
    }, 0);
    
    debugLog(`  - Total challenges processed: ${allRequirements.length}`);
    debugLog(`  - Successfully fetched from API: ${sourceCounts.api || 0}`);
    debugLog(`  - Converted from API: ${sourceCounts['api-converted'] || 0}`);
    debugLog(`  - Used fallback: ${sourceCounts.fallback || 0}`);
    debugLog(`  - Total dependencies found: ${totalDependencies}`);
    
    // List challenges with dependencies
    const challengesWithDeps = allRequirements.filter(req => req.requirements.length > 0);
    debugLog(`\n🔗 CHALLENGES WITH DEPENDENCIES (${challengesWithDeps.length}):`); 
    challengesWithDeps.forEach(req => {
        const challengeName = challengeMap[req.challengeId]?.name || 'Unknown';
        debugLog(`  - ${challengeName}: [${req.requirements.join(', ')}] (${req.source})`);
    });
    
    if (challengesWithDeps.length === 0) {
        debugLog('  ⚠️ NO DEPENDENCIES FOUND! This will result in all challenges being at level 0.');
        debugLog('  This could mean:');
        debugLog('    1. CTFd instance has no challenge dependencies configured');
        debugLog('    2. Requirements API endpoint is not available');
        debugLog('    3. Current user lacks permissions to access requirements');
        debugLog('    4. CTFd version does not support challenge dependencies');
        
        // Test our dependency logic with known data to ensure it works
        debugLog('\\n🧪 TESTING DEPENDENCY LOGIC...');
        validateDependencyLogic();
    }
    
    // Calculer les niveaux hiérarchiques avec DEBUG détaillé
    const levels = {};
    debugLog('\\n🧮 ===== LEVEL CALCULATION PHASE =====');
    debugLog(`📋 Total challenges to process: ${Object.keys(challengeMap).length}`);
    debugLog(`🗂️ Challenge IDs: [${Object.keys(challengeMap).join(', ')}]`);
    
    // First, show a summary of all dependencies
    debugLog('\\n📊 DEPENDENCY SUMMARY:');
    Object.entries(challengeMap).forEach(([id, challenge]) => {
        const depCount = (challenge.dependencies || []).length;
        const depsStr = depCount > 0 ? `[${challenge.dependencies.join(', ')}]` : 'none';
        debugLog(`  ${id}: ${challenge.name} - deps: ${depsStr} (${depCount} total)`);
    });
    
    debugLog('\\n🔢 CALCULATING LEVELS FOR ALL CHALLENGES:');
    Object.keys(challengeMap).forEach((challengeId, index) => {
        debugLog(`\\n--- [${index + 1}/${Object.keys(challengeMap).length}] Processing Challenge: ${challengeId} ---`);
        const level = calculateChallengeLevel(challengeId, challengeMap, levels);
        debugLog(`✅ Final level for ${challengeMap[challengeId].name} (${challengeId}): ${level}`);
        debugLog(`📈 Current levels state: ${JSON.stringify(levels, null, 2)}`);
    });
    
    debugLog('=== NIVEAUX HIÉRARCHIQUES ===');
    debugLog('Niveaux calculés:', levels);
    debugLog(`Niveau maximum: ${Math.max(...Object.values(levels), 0)}`);
    debugLog('Challenges avec dépendances:', Object.entries(challengeMap).filter(([id, ch]) => ch.dependencies.length > 0).length);
    
    // Afficher les dépendances de chaque challenge avec DEBUG
    debugLog('\\n🔗 DETAILED DEPENDENCY ANALYSIS:');
    Object.entries(challengeMap).forEach(([id, ch]) => {
        debugLog(`\\n📋 Challenge: ${ch.name} (ID: ${id}, Level: ${levels[id]})`);
        debugLog(`  📊 Position: (${ch.position.x}, ${ch.position.y})`);
        debugLog(`  🎯 Points: ${ch.points}, Category: ${ch.category}`);
        
        if (ch.dependencies.length > 0) {
            debugLog(`  🔗 Dependencies (${ch.dependencies.length}):`);
            ch.dependencies.forEach((depId, index) => {
                const dep = challengeMap[depId];
                if (dep) {
                    debugLog(`    [${index + 1}] ${dep.name} (ID: ${depId}, Level: ${levels[depId]})`);
                } else {
                    debugWarn(`    [${index + 1}] ❌ MISSING: ID ${depId} not found in challengeMap`);
                }
            });
        } else {
            debugLog(`  🌱 ROOT CHALLENGE (no dependencies)`);
        }
    });
    
    // Validate level consistency
    debugLog('\\n🔍 LEVEL CONSISTENCY VALIDATION:');
    let inconsistencyFound = false;
    Object.entries(challengeMap).forEach(([id, ch]) => {
        if (ch.dependencies.length > 0) {
            const challengeLevel = levels[id];
            const maxDepLevel = Math.max(...ch.dependencies.map(depId => levels[depId] || 0));
            const expectedLevel = maxDepLevel + 1;
            
            if (challengeLevel !== expectedLevel) {
                console.error(`  ❌ INCONSISTENCY: ${ch.name} has level ${challengeLevel}, but should be ${expectedLevel} based on dependencies`);
                inconsistencyFound = true;
            } else {
                debugLog(`  ✅ ${ch.name}: Level ${challengeLevel} is correct`);
            }
        }
    });
    
    if (!inconsistencyFound) {
        debugLog('  🎉 All challenge levels are consistent!');
    }
    
    // Calculer le niveau maximum
    const maxLevel = Math.max(...Object.values(levels), 0);
    debugLog(`NIVEAU MAXIMUM FINAL: ${maxLevel}`);
    
    // ALGORITHME SIMPLE ET EFFICACE
    debugLog('=== POSITIONNEMENT DES CHALLENGES ===');
    
    // Grouper par niveau avec DEBUG détaillé
    const levelChallenges = {};
    for (let i = 0; i <= maxLevel; i++) {
        levelChallenges[i] = [];
    }
    
    debugLog('=== GROUPEMENT PAR NIVEAU ===');
    Object.entries(challengeMap).forEach(([id, challenge]) => {
        const level = levels[id] || 0;
        levelChallenges[level].push(id);
        debugLog(`${challenge.name} assigné au niveau ${level}`);
    });
    
    // Afficher la distribution par niveau
    for (let level = 0; level <= maxLevel; level++) {
        debugLog(`Niveau ${level}: ${levelChallenges[level].length} challenges - [${levelChallenges[level].map(id => challengeMap[id].name).join(', ')}]`);
    }
    
    // ✅ PROFESSIONAL POSITIONING ALGORITHM - TOP-DOWN HIERARCHY
    const CANVAS_WIDTH = 1400; // Wider canvas for better distribution
    const LEVEL_HEIGHT = 200;  // More vertical space between levels
    const CHALLENGE_WIDTH = 140;
    const START_Y = 60;        // Start near top for Level 0 (ROOT)
    const MIN_SPACING = 180;   // Minimum horizontal spacing
    
    debugLog('\\n🎨 ===== POSITIONING ALGORITHM =====');
    debugLog(`📐 Canvas width: ${CANVAS_WIDTH}px`);
    debugLog(`📏 Level height: ${LEVEL_HEIGHT}px`);
    debugLog(`📦 Challenge width: ${CHALLENGE_WIDTH}px`);
    debugLog(`📍 Start Y: ${START_Y}px`);
    debugLog(`↔️ Min spacing: ${MIN_SPACING}px`);
    debugLog(`📊 Level 0 (ROOT) at Y=${START_Y} - Dependencies flow DOWNWARD`);
    
    for (let level = 0; level <= maxLevel; level++) {
        const challenges = levelChallenges[level];
        if (challenges.length === 0) continue;
        
        // ✅ CORRECT HIERARCHY: Level 0 = TOP (smallest Y), Level N = BOTTOM (largest Y)
        const y = START_Y + (level * LEVEL_HEIGHT);
        
        // Smart horizontal distribution
        const totalWidth = CANVAS_WIDTH - 160; // Better margins
        let spacing, startX;
        
        if (challenges.length === 1) {
            // Single challenge: center horizontally
            startX = (CANVAS_WIDTH - CHALLENGE_WIDTH) / 2;
            spacing = 0;
        } else {
            // Multiple challenges: distribute with optimal spacing
            const optimalSpacing = totalWidth / (challenges.length - 1);
            spacing = Math.max(MIN_SPACING, Math.min(optimalSpacing, 350)); // Cap max spacing
            
            const totalUsedWidth = (challenges.length - 1) * spacing;
            startX = (CANVAS_WIDTH - totalUsedWidth) / 2;
        }
        
        debugLog(`\\n📍 LEVEL ${level} POSITIONING:`);
        debugLog(`  📊 Challenge count: ${challenges.length}`);
        debugLog(`  📏 Y position: ${y}px`);
        debugLog(`  📐 Start X: ${startX}px`);
        debugLog(`  ↔️ Spacing: ${spacing}px`);
        
        // Position each challenge in this level
        challenges.forEach((id, index) => {
            const x = challenges.length === 1 ? startX : startX + (index * spacing);
            
            debugLog(`    [${index + 1}/${challenges.length}] Positioning ${challengeMap[id].name}:`);
            debugLog(`      - Calculation: ${challenges.length === 1 ? 'Single (centered)' : `startX(${startX}) + index(${index}) * spacing(${spacing})`} = ${x}`);
            
            challengeMap[id].position = {
                x: Math.round(x),
                y: y
            };
            
            const levelType = level === 0 ? 'ROOT' : `LEVEL-${level}`;
            debugLog(`      - Final position: (${challengeMap[id].position.x}, ${challengeMap[id].position.y})`);
            debugLog(`      ✅ ${levelType}: ${challengeMap[id].name} positioned`);
        });
    }
    
    debugLog('\\n📈 FINAL HIERARCHY SUMMARY:');
    debugLog(`  🎯 Total challenges: ${Object.keys(challengeMap).length}`);
    debugLog(`  📊 Max level: ${maxLevel}`);
    debugLog(`  🔗 Challenges with dependencies: ${Object.entries(challengeMap).filter(([id, ch]) => ch.dependencies.length > 0).length}`);
    debugLog(`  🌱 Root challenges (level 0): ${levelChallenges[0]?.length || 0}`);
    
    // DEBUG: Final position validation
    debugLog('\\n🎨 FINAL POSITION VALIDATION:');
    let positionErrors = 0;
    Object.entries(challengeMap).forEach(([id, ch]) => {
        if (typeof ch.position.x !== 'number' || typeof ch.position.y !== 'number') {
            console.error(`  ❌ ${ch.name}: Invalid position (${ch.position.x}, ${ch.position.y})`);
            positionErrors++;
        } else if (ch.position.x < 0 || ch.position.y < 0) {
            debugWarn(`  ⚠️ ${ch.name}: Negative position (${ch.position.x}, ${ch.position.y})`);
        } else {
            debugLog(`  ✅ ${ch.name}: Valid position (${ch.position.x}, ${ch.position.y}) at level ${levels[id] || 0}`);
        }
    });
    
    if (positionErrors === 0) {
        debugLog('  🎉 All challenge positions are valid!');
    } else {
        console.error(`  💥 Found ${positionErrors} position errors!`);
    }
    
    // Show distribution by level
    debugLog('\\n📊 FINAL LEVEL DISTRIBUTION:');
    for (let level = 0; level <= maxLevel; level++) {
        const challenges = levelChallenges[level];
        if (challenges.length > 0) {
            debugLog(`  Level ${level}: ${challenges.length} challenges`);
            challenges.forEach(id => {
                const ch = challengeMap[id];
                debugLog(`    - ${ch.name} at (${ch.position.x}, ${ch.position.y})`);
            });
        }
    }
    
    // Si tous les challenges sont au niveau 0 (pas de dépendances), créer une hiérarchie artificielle
    if (maxLevel === 0 && Object.keys(challengeMap).length > 5) {
        debugLog('=== AUCUNE DÉPENDANCE TROUVÉE ===');
        debugLog('Création d\'une hiérarchie artificielle basée sur les points et catégories...');
        
        // Option 1: Créer des dépendances artificielles basées sur les points
        const challengesByCategory = {};
        Object.entries(challengeMap).forEach(([id, challenge]) => {
            const cat = challenge.category || 'default';
            if (!challengesByCategory[cat]) challengesByCategory[cat] = [];
            challengesByCategory[cat].push({ id, challenge });
        });
        
        let artificialDependenciesCreated = 0;
        
        Object.entries(challengesByCategory).forEach(([category, challenges]) => {
            if (challenges.length < 2) return; // Pas assez de challenges pour créer des dépendances
            
            // Trier par points (croissant)
            challenges.sort((a, b) => a.challenge.points - b.challenge.points);
            
            // Créer une chaîne de dépendances simple
            for (let i = 1; i < challenges.length; i++) {
                const currentChallenge = challenges[i];
                const previousChallenge = challenges[i - 1];
                
                // Le challenge actuel dépend du précédent
                challengeMap[currentChallenge.id].dependencies = [previousChallenge.id];
                artificialDependenciesCreated++;
                
                debugLog(`  Dépendance créée: ${currentChallenge.challenge.name} dépend de ${previousChallenge.challenge.name}`);
            }
        });
        
        if (artificialDependenciesCreated > 0) {
            debugLog(`${artificialDependenciesCreated} dépendances artificielles créées`);
            
            // Recalculer les niveaux avec les nouvelles dépendances
            const newLevels = {};
            Object.keys(challengeMap).forEach(challengeId => {
                calculateChallengeLevel(challengeId, challengeMap, newLevels);
            });
            
            const newMaxLevel = Math.max(...Object.values(newLevels), 0);
            debugLog(`Nouveaux niveaux après dépendances artificielles:`, newLevels);
            debugLog(`Nouveau niveau maximum: ${newMaxLevel}`);
            
            // Repositionner avec les nouveaux niveaux
            if (newMaxLevel > 0) {
                const newLevelChallenges = {};
                for (let i = 0; i <= newMaxLevel; i++) {
                    newLevelChallenges[i] = [];
                }
                
                Object.entries(challengeMap).forEach(([id, challenge]) => {
                    const level = newLevels[id] || 0;
                    newLevelChallenges[level].push(id);
                });
                
                // Repositionner avec le même algorithme
                for (let level = 0; level <= newMaxLevel; level++) {
                    const challenges = newLevelChallenges[level];
                    if (challenges.length === 0) continue;
                    
                    const y = START_Y + (level * LEVEL_HEIGHT);
                    const totalWidth = CANVAS_WIDTH - 200;
                    let spacing = challenges.length > 1 ? Math.max(MIN_SPACING, totalWidth / (challenges.length - 1)) : 0;
                    
                    if (spacing > 300) spacing = MIN_SPACING;
                    
                    const totalUsedWidth = (challenges.length - 1) * spacing;
                    const startX = challenges.length === 1 ? CANVAS_WIDTH / 2 - CHALLENGE_WIDTH / 2 : 
                                   (CANVAS_WIDTH - totalUsedWidth) / 2;
                    
                    challenges.forEach((id, index) => {
                        const x = challenges.length === 1 ? startX : startX + (index * spacing);
                        challengeMap[id].position = { x: Math.round(x), y: y };
                        debugLog(`  Repositionné ${challengeMap[id].name}: niveau ${level}, (${x}, ${y})`);
                    });
                }
                
                return; // Sortir de la fonction, on a terminé
            }
        }
        
        // Fallback: organisation par catégorie si pas de dépendances artificielles possibles
        debugLog('Fallback: organisation par catégorie en grille');
        
        const categoryGroups = {};
        Object.entries(challengeMap).forEach(([id, challenge]) => {
            const cat = challenge.category || 'default';
            if (!categoryGroups[cat]) categoryGroups[cat] = [];
            categoryGroups[cat].push(id);
        });
        
        const categories = Object.keys(categoryGroups).sort();
        const challengesPerRow = 6;
        const rowHeight = 140;
        const colWidth = 180;
        const startX = 50;
        const startY = 50;
        
        let currentY = startY;
        
        categories.forEach((category, catIndex) => {
            const challenges = categoryGroups[category];
            debugLog(`Catégorie ${category}: ${challenges.length} challenges`);
            
            challenges.forEach((challengeId, index) => {
                const row = Math.floor(index / challengesPerRow);
                const col = index % challengesPerRow;
                
                challengeMap[challengeId].position = {
                    x: startX + (col * colWidth),
                    y: currentY + (row * rowHeight)
                };
            });
            
            const rowsInCategory = Math.ceil(challenges.length / challengesPerRow);
            currentY += rowsInCategory * rowHeight + 40;
        });
    }
}

function selectAllTeams() {
    if (!userPermissions.canViewAllTeams) return;
    setSelectedTeams(teams.map(t => t.name));
    updateVisualization();
}

function deselectAllTeams() {
    if (!userPermissions.canViewAllTeams) return;
    setSelectedTeams([]);
    updateVisualization();
}

function selectSingleTeam() {
    if (!userPermissions.canViewAllTeams) return;
    // Sélectionner seulement la première équipe ou celle avec le meilleur score
    const bestTeam = teams.reduce((best, team) => {
        const teamScore = getTeamSolvedCount(team.name);
        const bestScore = getTeamSolvedCount(best.name);
        return teamScore > bestScore ? team : best;
    }, teams[0]);
    
    setSelectedTeams([bestTeam.name]);
    updateVisualization();
}

// ===== FONCTIONS DE NAVIGATION ET ZOOM =====

// Clean transform function for unified SVG+challenges container
function updateTransform() {
    const wrapper = document.getElementById('transform-wrapper');
    
    if (wrapper) {
        // Apply transform to the unified wrapper containing both challenges and SVG
        const transform = `translate(${currentPan.x}px, ${currentPan.y}px) scale(${currentZoom})`;
        wrapper.style.transform = transform;
        wrapper.style.transformOrigin = '0 0';
        
        // 🔧 Update wrapper dimensions to match content
        updateWrapperDimensions();
    }
    
    updateNavigationInfo();
}

// 🔧 NEW FUNCTION: Update transform wrapper dimensions based on content
function updateWrapperDimensions() {
    const wrapper = document.getElementById('transform-wrapper');
    if (!wrapper) return;
    
    const viewport = calculateSVGViewport();
    
    // Ensure wrapper is large enough to contain all content
    const wrapperWidth = Math.max(1400, viewport.width);
    const wrapperHeight = Math.max(1000, viewport.height);
    
    wrapper.style.width = `${wrapperWidth}px`;
    wrapper.style.height = `${wrapperHeight}px`;
    
    debugLog(`🔧 Updated wrapper dimensions: ${wrapperWidth}×${wrapperHeight}`);
}

function updateNavigationInfo() {
    const zoomElement = document.getElementById('zoom-level');
    const panElement = document.getElementById('pan-position');
    
    if (zoomElement) {
        zoomElement.textContent = Math.round(currentZoom * 100) + '%';
    }
    
    if (panElement) {
        panElement.textContent = `${Math.round(currentPan.x)}, ${Math.round(currentPan.y)}`;
    }
}

function zoomIn() {
    if (d3SystemReady && window.zoomInD3 && typeof d3Data !== 'undefined' && d3Data.svg) {
        zoomInD3();
    } else {
        currentZoom = Math.min(currentZoom * 1.2, 3);
        updateTransform();
    }
}

function zoomOut() {
    if (d3SystemReady && window.zoomOutD3 && typeof d3Data !== 'undefined' && d3Data.svg) {
        zoomOutD3();
    } else {
        currentZoom = Math.max(currentZoom / 1.2, 0.3);
        updateTransform();
    }
}

function resetView() {
    if (d3SystemReady && window.resetViewD3 && typeof d3Data !== 'undefined' && d3Data.svg) {
        resetViewD3();
    } else {
        currentZoom = 1;
        currentPan = { x: 0, y: 0 };
        updateTransform();
    }
}

function fitToScreen() {
    // Use D3 fitToScreen if available
    if (d3SystemReady && window.fitToScreenD3 && typeof d3Data !== 'undefined' && d3Data.svg) {
        fitToScreenD3();
        return;
    }
    
    // Legacy fitToScreen implementation
    const mapContainer = document.getElementById('map-container');
    const challengesContainer = document.getElementById('challenges-container');
    
    if (!mapContainer || !challengesContainer) return;
    
    // Calculer les dimensions du contenu
    const challenges = challengesContainer.querySelectorAll('.challenge-node');
    if (challenges.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    challenges.forEach(challenge => {
        const rect = challenge.getBoundingClientRect();
        const containerRect = challengesContainer.getBoundingClientRect();
        
        const x = rect.left - containerRect.left;
        const y = rect.top - containerRect.top;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width);
        maxY = Math.max(maxY, y + rect.height);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const containerWidth = mapContainer.clientWidth;
    const containerHeight = mapContainer.clientHeight;
    
    // Calculer le zoom pour ajuster le contenu
    const scaleX = containerWidth / (contentWidth + 100); // +100 pour les marges
    const scaleY = containerHeight / (contentHeight + 100);
    currentZoom = Math.min(scaleX, scaleY, 1); // Ne pas zoomer plus que 100%
    
    // Centrer le contenu
    currentPan.x = (containerWidth - contentWidth * currentZoom) / 2 - minX * currentZoom;
    currentPan.y = (containerHeight - contentHeight * currentZoom) / 2 - minY * currentZoom;
    
    updateTransform();
}

function initializeMapNavigation() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    
    // ✅ PROFESSIONAL ZOOM with mouse position focus
    mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(currentZoom * zoomFactor, 0.2), 4); // Extended zoom range
        
        // Zoom centered on mouse position for better UX
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomChange = newZoom / currentZoom;
        currentPan.x = mouseX - (mouseX - currentPan.x) * zoomChange;
        currentPan.y = mouseY - (mouseY - currentPan.y) * zoomChange;
        currentZoom = newZoom;
        
        // ✅ Update transform with immediate visual feedback
        updateTransform();
    });
    
    // 🎯 PROFESSIONAL DRAG handling with better target detection
    mapContainer.addEventListener('mousedown', (e) => {
        // Allow dragging when clicking on map background, SVG, or challenges container
        const isValidDragTarget = e.target === mapContainer || 
                                  e.target.closest('#challenges-container') ||
                                  e.target.id === 'dependencies-svg';
        
        if (isValidDragTarget && !e.target.closest('.challenge-node')) {
            isDragging = true;
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            lastPan.x = currentPan.x;
            lastPan.y = currentPan.y;
            
            mapContainer.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            currentPan.x = lastPan.x + (e.clientX - dragStart.x);
            currentPan.y = lastPan.y + (e.clientY - dragStart.y);
            updateTransform();
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            mapContainer.style.cursor = 'grab';
        }
    });
    
    // Support tactile pour les appareils mobiles
    let lastTouchDistance = 0;
    
    mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
        } else if (e.touches.length === 1) {
            isDragging = true;
            dragStart.x = e.touches[0].clientX;
            dragStart.y = e.touches[0].clientY;
            lastPan.x = currentPan.x;
            lastPan.y = currentPan.y;
        }
        e.preventDefault();
    });
    
    mapContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            if (lastTouchDistance > 0) {
                const zoomFactor = currentDistance / lastTouchDistance;
                currentZoom = Math.min(Math.max(currentZoom * zoomFactor, 0.3), 3);
                updateTransform();
            }
            
            lastTouchDistance = currentDistance;
        } else if (e.touches.length === 1 && isDragging) {
            currentPan.x = lastPan.x + (e.touches[0].clientX - dragStart.x);
            currentPan.y = lastPan.y + (e.touches[0].clientY - dragStart.y);
            updateTransform();
        }
        e.preventDefault();
    });
    
    mapContainer.addEventListener('touchend', () => {
        isDragging = false;
        lastTouchDistance = 0;
    });
}

/**
 * Wait for essential DOM elements to be ready
 */
async function waitForEssentialElements(timeout = 10000) {
    const essentialElements = [
        'login-modal',
        'container'
    ];
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const allPresent = essentialElements.every(id => {
            const element = document.getElementById(id);
            return element && element.offsetParent !== null; // Check if element is visible
        });
        
        if (allPresent) {
            debugLog('✅ All essential DOM elements are ready');
            return true;
        }
        
        // Wait 50ms before checking again
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    debugWarn('⚠️ Some essential elements not ready after timeout:', 
        essentialElements.filter(id => !document.getElementById(id)));
    return false;
}

/**
 * Run startup verification to ensure systems are working properly
 */
function runStartupVerification() {
    debugLog('🔍 Running startup verification...');
    
    const checks = {
        'DOM Ready': () => document.readyState === 'complete',
        'Main Container': () => document.getElementById('container') !== null,
        'Map Container': () => document.getElementById('map-container') !== null,
        'D3 Library': () => typeof d3 !== 'undefined',
        'Notification System': () => false // Removed
    };
    
    let allPassed = true;
    for (const [checkName, checkFunction] of Object.entries(checks)) {
        try {
            const result = checkFunction();
            debugLog(`  ${result ? '✅' : '❌'} ${checkName}: ${result}`);
            if (!result) allPassed = false;
        } catch (error) {
            debugLog(`  ❌ ${checkName}: ERROR - ${error.message}`);
            allPassed = false;
        }
    }
    
    if (allPassed) {
        debugLog('✅ All startup checks passed');
    } else {
        debugWarn('⚠️ Some startup checks failed - application may have limited functionality');
    }
    
    // Test basic API readiness (not actual connection)
    if (typeof fetch === 'function') {
        debugLog('  ✅ API capabilities available');
    } else {
        debugWarn('  ⚠️ Fetch API not available - old browser?');
    }
}

// Fonction pour charger la config proxy
async function loadProxyConfig() {
    try {
        debugLog('🔧 Chargement de la configuration proxy...');
        
        // Indiquer le chargement dans l'interface
        const urlInput = document.getElementById('ctfd-url');
        if (urlInput) {
            urlInput.placeholder = 'Chargement de la configuration...';
            urlInput.disabled = true;
        }
        
        // Vérifier que le proxy est actif
        const healthResponse = await fetch('/health');
        const healthData = await healthResponse.json();
        debugLog('Proxy status:', healthData);
        
        // Récupérer la configuration
        const configResponse = await fetch('/config');
        const config = await configResponse.json();
        
        // Mettre à jour le champ URL
        if (urlInput && config.ctfdUrl) {
            urlInput.value = config.ctfdUrl;
            urlInput.placeholder = 'https://demo.ctfd.io';
            debugLog('URL pré-remplie avec CTFD_URL:', config.ctfdUrl);
        }
        
        // Afficher un indicateur que le proxy est actif
        updateAPIStatus('proxy', `Proxy actif: ${config.ctfdUrl}`);
        
    } catch (error) {
        debugLog('Proxy non accessible:', error);
        
        // Restaurer le champ URL
        const urlInput = document.getElementById('ctfd-url');
        if (urlInput) {
            urlInput.value = 'https://demo.ctfd.io';
            urlInput.placeholder = 'https://demo.ctfd.io';
            urlInput.disabled = false;
        }
        
        // Afficher un avertissement que le proxy n'est pas actif
        updateAPIStatus('proxy-down', 'Proxy non démarré - utilisez npm start');
        showError('Le proxy local n\'est pas démarré. Lancez "npm start" ou utilisez le mode direct avec une extension CORS.');
    } finally {
        // Réactiver le champ URL
        const urlInput = document.getElementById('ctfd-url');
        if (urlInput) {
            urlInput.disabled = false;
        }
    }
}

// Initialisation with enhanced error handling
document.addEventListener('DOMContentLoaded', async () => {
    debugLog('🚀 Starting application initialization...');
    
    // Wait for all essential DOM elements to be ready
    await waitForEssentialElements();
    
    // Charger immédiatement la config proxy si en mode local (avant autres initialisations)
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000') {
        await loadProxyConfig();
    }
    
    // D3.js will be initialized after login when container is visible
    
    // Run startup verification
    runStartupVerification();
    
    // Initialiser la navigation de la carte
    initializeMapNavigation();
    
    // Initialize drag & drop system
    initializeDragAndDrop();
    
}); // End of initialization