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
let userPermissions = { 
    canViewAllTeams: false,      // Voir la progression de toutes les équipes (admin uniquement)
    canManageTeams: false,       // Gérer/sélectionner les équipes (admin + joueurs avec accès)
    canViewFutureChalls: false, 
    isAdmin: false 
};
let teamStatusFilters = { active: true, hidden: true, banned: true }; // Filtres pour les statuts d'équipes

// Configuration de debug
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get('debug') === 'true' || 
                     localStorage.getItem('CTFDMAP_DEBUG') === 'true' ||
                     (typeof process !== 'undefined' && process.env && process.env.CTFDMAP_DEBUG === 'true');

// Fonctions de debug conditionnelles
const debugLog = (...args) => DEBUG_ENABLED && console.log(...args);
const debugWarn = (...args) => DEBUG_ENABLED && console.warn(...args);
const debugError = (...args) => console.error(...args); // Les erreurs sont toujours affichées

// Échappement HTML pour toute donnée non-fiable injectée via innerHTML / template literals.
// À utiliser systématiquement sur les noms d'équipes, de challenges, catégories,
// messages d'erreur API, et toute chaîne provenant de CTFd ou de l'utilisateur.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}
// Variante pour les chaînes injectées dans un littéral JS entre apostrophes (ex: onclick="f('${x}')").
// Les inline handlers restent à éviter, mais tant qu'ils existent on doit au moins neutraliser ' " \ et </script>.
function escapeJsString(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/</g, '\\x3c');
}
window.escapeHtml = escapeHtml;
window.escapeJsString = escapeJsString;

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

    // Panneaux flottants déplaçables par leur titre
    makePanelDraggable('heatmap-legend', '.heatmap-legend-title');
    makePanelDraggable('animation-timeline', '.timeline-header');
});

/**
 * Calculate average solve time for each challenge from selected teams
 * Returns object with challengeId -> average time in milliseconds
 */
function calculateChallengeHeatmap() {
    const heatmapData = {};
    
    debugLog('🔥 calculateChallengeHeatmap called:', {
        selectedTeams,
        selectedTeamsLength: selectedTeams ? selectedTeams.length : 0,
        teamProgressKeys: Object.keys(teamProgress)
    });
    
    if (!selectedTeams || selectedTeams.length === 0) {
        debugLog('⚠️ Pas d\'équipes sélectionnées pour la heatmap');
        return heatmapData;
    }
    
    // Iterate through all challenges
    Object.keys(challengeMap).forEach(challengeId => {
        const solveTimes = [];
        
        // Collect solve times from selected teams
        selectedTeams.forEach(teamName => {
            const teamData = teamProgress[teamName];
            if (teamData && teamData[challengeId] && 
                (teamData[challengeId].solved === true || teamData[challengeId].status === 'solved') && 
                teamData[challengeId].date) {
                
                const solveDate = new Date(teamData[challengeId].date);
                if (isNaN(solveDate.getTime())) {
                    debugLog(`⚠️ Date invalide pour heatmap: ${teamName} - ${challengeId}`);
                    return; // Ignorer cette entrée
                }
                
                // Find when challenge was unlocked for this team
                const unlockTime = findChallengeUnlockTime(teamName, challengeId);
                if (unlockTime) {
                    // Calculate time from unlock to solve
                    const timeDiff = solveDate - unlockTime;
                    // Protection contre les temps négatifs (peut arriver si les données sont incohérentes)
                    if (timeDiff > 0) {
                        solveTimes.push(timeDiff);
                    } else {
                        debugLog(`⚠️ Temps négatif détecté: ${teamName} - ${challengeId} (${timeDiff}ms)`);
                        // Utiliser un temps minimal de 5 minutes
                        solveTimes.push(300000); // 5 minutes
                    }
                } else {
                    // No dependencies, use time from first solve or previous solve
                    const firstSolve = findFirstSolveForTeam(teamName);
                    if (firstSolve) {
                        const firstSolveDate = new Date(firstSolve.date);
                        if (!isNaN(firstSolveDate.getTime())) {
                            const timeDiff = solveDate - firstSolveDate;
                            // Protection contre les temps négatifs
                            if (timeDiff > 0) {
                                solveTimes.push(timeDiff);
                            } else {
                                // Si temps négatif, utiliser le temps depuis le solve précédent
                                const prevSolve = findPreviousSolveForTeam(teamName, challengeId, solveDate);
                                if (prevSolve) {
                                    const prevDate = new Date(prevSolve.date);
                                    const prevDiff = solveDate - prevDate;
                                    if (prevDiff > 0) {
                                        solveTimes.push(prevDiff);
                                    } else {
                                        // Fallback: 30 minutes
                                        solveTimes.push(1800000);
                                    }
                                } else {
                                    // Fallback: 30 minutes pour le premier challenge
                                    solveTimes.push(1800000);
                                }
                            }
                        }
                    } else {
                        // Fallback: use 1 hour as default time
                        solveTimes.push(3600000); // 1 hour in ms
                    }
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
    
    debugLog('🔥 Heatmap calculation:', {
        selectedTeams,
        heatmapDataKeys: Object.keys(heatmapData),
        timesCount: times.length,
        sampleData: Object.entries(heatmapData).slice(0, 3)
    });
    
    if (times.length === 0) {
        debugLog('⚠️ Aucune donnée de temps pour la heatmap');
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
window.customPositions = customPositions; // Expose for D3

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
    
    // Si on change la sélection et que l'interface est visible, mettre à jour l'affichage
    if (document.getElementById('container').style.display !== 'none' && Object.keys(challengeMap).length > 0) {
        // Pour les utilisateurs non-admin avec une équipe sélectionnée, forcer la mise à jour
        if (!userPermissions.isAdmin && newTeams.length > 0) {
            debugLog('🔄 Mise à jour automatique pour l\'équipe:', newTeams);
            setTimeout(() => {
                updateVisualization();
            }, 50);
        }
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

/**
 * Get total number of teams/users who solved a challenge
 */
async function getTotalSolvesForChallenge(challengeId) {
    try {
        // For admin users, try to get total solves from the API
        if (userPermissions.isAdmin) {
            try {
                const response = await callCTFdAPI(`/api/v1/challenges/${challengeId}/solves`, 'GET');
                if (response.data && Array.isArray(response.data)) {
                    return {
                        total: response.data.length,
                        isFromAPI: true
                    };
                }
            } catch (error) {
                debugLog('Could not fetch total solves from API, falling back to local data');
            }
        }
        
        // Fallback: Count from loaded team data
        let totalSolves = 0;
        Object.values(teamProgress).forEach(team => {
            if (team[challengeId] && (team[challengeId].solved === true || team[challengeId].status === 'solved')) {
                totalSolves++;
            }
        });
        
        return {
            total: totalSolves,
            isFromAPI: false
        };
    } catch (error) {
        console.error('Error getting total solves:', error);
        return { total: 0, isFromAPI: false };
    }
}

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
        background: var(--surface);
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
        <h2 style="margin-bottom: 16px; font-size: 20px;">${escapeHtml(challenge.name)}</h2>
        <div style="margin-bottom: 20px; color: var(--text-dim); font-size: 14px;">
            <span style="background: var(--surface-2); padding: 4px 8px; border-radius: 4px; margin-right: 8px;">${escapeHtml(challenge.category)}</span>
            <span>${Number(challenge.points) || 0} points</span>
        </div>
        <div id="solves-loading" style="text-align: center; padding: 40px;">
            
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
        
        // Get total solves for this challenge
        const totalSolvesInfo = await getTotalSolvesForChallenge(challengeId);
        
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
                        teamColor: team ? team.color : '#8b96a5',
                        date: solveDate,
                        dateStr: formatDate(solveDate),
                        place: 1,
                        timeDiff: null,
                        timeDiffStr: '',
                        timeFromUnlock: null,
                        timeFromUnlockStr: '',
                        timeFromPrevChall: null,
                        timeFromPrevChallStr: '',
                        relativeTime,
                        relativeTimeStr,
                        attempts: 1
                    }];
                    
                    // Calculer le temps depuis que le challenge est disponible
                    const unlockTime = findChallengeUnlockTime(teamName, challengeId);
                    if (unlockTime) {
                        solveData[0].timeFromUnlock = solveDate - unlockTime;
                        
                        // Debug pour identifier les temps négatifs
                        if (solveData[0].timeFromUnlock < 0) {
                            console.warn(`⚠️ Temps de résolution négatif détecté (mode joueur):`, {
                                team: teamName,
                                challenge: challengeId,
                                challengeName: challenge.name,
                                solveDate: solveDate,
                                unlockTime: unlockTime,
                                difference: solveData[0].timeFromUnlock,
                                solveDateFormatted: solveDate.toISOString(),
                                unlockTimeFormatted: unlockTime.toISOString()
                            });
                            
                            // Protection : utiliser un temps minimum de 1 minute si négatif
                            solveData[0].timeFromUnlock = Math.max(solveData[0].timeFromUnlock, 60000); // 1 minute minimum
                        }
                        
                        solveData[0].timeFromUnlockStr = formatTimeDiffDetailed(solveData[0].timeFromUnlock);
                    }
                    
                    // Calculer le temps depuis le challenge précédent (n'importe lequel)
                    const prevChallSolve = findPreviousSolveForTeam(teamName, challengeId, solveDate);
                    if (prevChallSolve) {
                        solveData[0].timeFromPrevChall = solveDate - new Date(prevChallSolve.date);
                        solveData[0].timeFromPrevChallStr = formatTimeDiffDetailed(solveData[0].timeFromPrevChall);
                    }
                    
                    displayChallengeSolves(solveData, challengeId, totalSolvesInfo);
                    return;
                }
            }
            
            // Pas de solve pour cet utilisateur
            displayChallengeSolves([], challengeId, totalSolvesInfo);
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
            
            // Calculer le temps depuis que le challenge est disponible
            let timeFromUnlock = null;
            let timeFromUnlockStr = '';
            const unlockTime = findChallengeUnlockTime(teamSolve.teamName, challengeId);
            if (unlockTime) {
                timeFromUnlock = teamSolve.date - unlockTime;
                
                // Debug pour identifier les temps négatifs
                if (timeFromUnlock < 0) {
                    console.warn(`⚠️ Temps de résolution négatif détecté (mode admin):`, {
                        team: teamSolve.teamName,
                        challenge: challengeId,
                        challengeName: challenge.name,
                        solveDate: teamSolve.date,
                        unlockTime: unlockTime,
                        difference: timeFromUnlock,
                        solveDateFormatted: new Date(teamSolve.date).toISOString(),
                        unlockTimeFormatted: unlockTime.toISOString()
                    });
                    
                    // Protection : utiliser un temps minimum de 1 minute si négatif
                    timeFromUnlock = Math.max(timeFromUnlock, 60000); // 1 minute minimum
                }
                
                timeFromUnlockStr = formatTimeDiffDetailed(timeFromUnlock);
            }
            
            // Calculer le temps depuis le challenge précédent pour cette équipe (n'importe lequel)
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
                teamColor: team ? team.color : '#8b96a5',
                date: teamSolve.date,
                dateStr: formatDate(teamSolve.date),
                place: index + 1,
                timeDiff,
                timeDiffStr,
                timeFromUnlock,
                timeFromUnlockStr,
                timeFromPrevChall,
                timeFromPrevChallStr,
                relativeTime,
                relativeTimeStr,
                attempts: (challengeAttempts && challengeAttempts[teamSolve.teamName]) || 1 // Utiliser les vraies tentatives ou 1 par défaut
            });
        });
        
        // Afficher les résultats
        displayChallengeSolves(solvesData, challengeId, totalSolvesInfo);
        
    } catch (error) {
        console.error('Erreur chargement solves:', error);
        
        // Try to show total solves even if detailed loading failed
        try {
            const totalSolvesInfo = await getTotalSolvesForChallenge(challengeId);
            displayChallengeSolves([], challengeId, totalSolvesInfo);
        } catch (totalError) {
            // If even total solves fails, show error message
            document.getElementById('solves-loading').innerHTML = `
                <div style="color: var(--danger);">Erreur de chargement</div>
                <div style="font-size: 12px; margin-top: 8px; color: var(--danger);">
                    ${escapeHtml(error.message || 'Erreur inconnue')}
                </div>
                <div style="font-size: 11px; margin-top: 8px; color: var(--text-faint);">
                    Vérifiez la console pour plus de détails
                </div>
            `;
        }
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

// Trouve quand un challenge devient disponible pour une équipe (quand tous ses prérequis sont résolus)
function findChallengeUnlockTime(teamName, challengeId) {
    const challenge = challengeMap[challengeId];
    if (!challenge || !challenge.dependencies || challenge.dependencies.length === 0) {
        // Pas de dépendances, disponible dès le début
        return null;
    }
    
    const teamSolves = teamProgress[teamName];
    if (!teamSolves) return null;
    
    let latestDependencyDate = null;
    
    // Trouver la date de résolution la plus tardive parmi toutes les dépendances
    for (const depId of challenge.dependencies) {
        const depProgress = teamSolves[depId];
        if (!depProgress || !(depProgress.solved === true || depProgress.status === 'solved')) {
            // Une dépendance n'est pas résolue, le challenge n'est pas disponible
            return null;
        }
        
        if (!depProgress.date) {
            debugLog(`⚠️ Pas de date pour la dépendance ${depId} de l'équipe ${teamName}`);
            continue;
        }
        
        const depDate = new Date(depProgress.date);
        if (isNaN(depDate.getTime())) {
            console.warn(`⚠️ Date invalide pour la dépendance ${depId}: ${depProgress.date}`);
            continue;
        }
        
        if (!latestDependencyDate || depDate > latestDependencyDate) {
            latestDependencyDate = depDate;
        }
    }
    
    return latestDependencyDate;
}

// Version modifiée de findPreviousSolveForTeam qui prend en compte le moment où le challenge devient disponible
function findPreviousSolveForTeamWithDependencies(teamName, currentChallengeId, currentSolveDate) {
    const unlockTime = findChallengeUnlockTime(teamName, currentChallengeId);
    
    const teamSolves = teamProgress[teamName];
    if (!teamSolves) return null;
    
    let mostRecentSolve = null;
    let mostRecentDate = null;
    
    for (const [challId, progress] of Object.entries(teamSolves)) {
        // Ignorer le challenge actuel et les non-résolus
        if (challId === currentChallengeId || 
            !(progress.solved === true || progress.status === 'solved')) continue;
        
        if (!progress.date) continue;
        
        const solveDate = new Date(progress.date);
        if (isNaN(solveDate.getTime())) continue;
        
        // Si on a un temps de déblocage, chercher les solves entre le déblocage et la résolution actuelle
        if (unlockTime) {
            if (solveDate >= unlockTime && solveDate < currentSolveDate) {
                if (!mostRecentDate || solveDate > mostRecentDate) {
                    mostRecentSolve = { challengeId: challId, ...progress };
                    mostRecentDate = solveDate;
                }
            }
        } else {
            // Comportement original : chercher les solves avant la date actuelle
            if (solveDate < currentSolveDate) {
                if (!mostRecentDate || solveDate > mostRecentDate) {
                    mostRecentSolve = { challengeId: challId, ...progress };
                    mostRecentDate = solveDate;
                }
            }
        }
    }
    
    return mostRecentSolve;
}

function displayChallengeSolves(solvesData, challengeId, totalSolves = null) {
    const content = document.getElementById('solves-content');
    const loading = document.getElementById('solves-loading');
    const challenge = challengeMap[challengeId];
    
    if (solvesData.length === 0) {
        loading.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                
                <div style="color: var(--text-dim); font-size: 16px;">
                    ${userPermissions.isAdmin ? 
                        'Aucune équipe sélectionnée n\'a résolu ce challenge' : 
                        'Votre équipe n\'a pas encore résolu ce challenge'}
                </div>
                ${userPermissions.isAdmin && selectedTeams.length === 0 ? 
                    '<div style="margin-top: 8px; font-size: 14px; color: var(--text-faint);">Sélectionnez des équipes dans la sidebar pour voir leurs résolutions</div>' : ''}
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
        <div style="background: var(--accent-bg); border: 1px solid var(--accent); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 16px; font-weight: 600; color: var(--accent);">
                        ${solvesData.length} résolution${solvesData.length > 1 ? 's' : ''}
                    </div>
                    ${userPermissions.isAdmin ? 
                        `<div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">
                            Parmi les ${selectedTeams.length} équipe(s) sélectionnée(s)
                        </div>` : ''}
                    ${totalSolves && totalSolves.total > 0 ? 
                        `<div style="font-size: 12px; color: var(--text-dim); margin-top: 4px; background: var(--accent-bg); border: 1px solid var(--accent); border-radius: 4px; padding: 2px 6px; display: inline-block;">
                            Total CTF : ${totalSolves.total} ${teams.length > 0 && !userPermissions.isAdmin ? 'équipe(s)' : 'résolution(s)'}
                        </div>` : ''}
                </div>
                ${averageTime > 0 ? `
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: var(--text-dim);">Temps moyen entre challenges</div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--accent);">${formatTimeDiff(averageTime)}</div>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${solvesData.map((solve, idx) => `
                <div style="background: var(--surface-2); 
                           border: 1px solid var(--border); 
                           border-radius: 8px; 
                           padding: 16px;
                           transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                <span style="font-weight: 700; 
                                           font-size: 20px; 
                                           color: var(--text);">
                                    #${solve.place}
                                </span>
                                <div style="width: 16px; height: 16px; background: ${escapeHtml(solve.teamColor)}; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                                <span style="font-weight: 600; font-size: 16px; color: var(--text);">${escapeHtml(solve.team)}</span>
                                ${solve.attempts > 1 ? `
                                    <span style="background: var(--danger-bg); color: var(--danger); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">
                                        ${Number(solve.attempts) - 1} fail${solve.attempts > 2 ? 's' : ''}
                                    </span>
                                ` : ''}
                            </div>
                            <div style="font-size: 14px; color: var(--text-dim);">
                                ${escapeHtml(solve.dateStr)}
                            </div>
                        </div>
                        <div style="text-align: right; min-width: 160px;">
                            ${solve.relativeTimeStr ? `
                                <div style="background: var(--attempted-bg); 
                                          border: 1px solid var(--attempted);
                                          border-radius: 6px; 
                                          padding: 4px 8px;
                                          margin-bottom: 4px;">
                                    <div style="font-size: 10px; color: var(--attempted); font-weight: 500;">Temps écoulé dans le CTF</div>
                                    <div style="font-size: 14px; color: var(--text); font-weight: 600;">${escapeHtml(solve.relativeTimeStr)}</div>
                                </div>
                            ` : ''}
                            ${solve.timeFromUnlockStr ? `
                                <div style="background: rgba(155, 124, 216, 0.14); 
                                          border: 1px solid #9b7cd8;
                                          border-radius: 6px; 
                                          padding: 4px 8px;
                                          margin-bottom: 4px;">
                                    <div style="font-size: 10px; color: #b9a3e3; font-weight: 500;">Temps pour résoudre (depuis déblocage)</div>
                                    <div style="font-size: 14px; color: var(--text); font-weight: 600;">${escapeHtml(solve.timeFromUnlockStr)}</div>
                                </div>
                            ` : ''}
                            ${solve.timeFromPrevChallStr ? `
                                <div style="background: var(--accent-bg); 
                                          border: 1px solid var(--accent);
                                          border-radius: 6px; 
                                          padding: 4px 8px;
                                          margin-bottom: 4px;">
                                    <div style="font-size: 10px; color: var(--accent); font-weight: 500;">Temps depuis challenge précédent</div>
                                    <div style="font-size: 14px; color: var(--text); font-weight: 600;">${escapeHtml(solve.timeFromPrevChallStr)}</div>
                                </div>
                            ` : ''}
                            ${solve.timeDiffStr && solve.place > 1 ? `
                                <div style="background: var(--solved-bg); 
                                          border: 1px solid var(--solved);
                                          border-radius: 6px; 
                                          padding: 4px 8px;">
                                    <div style="font-size: 10px; color: var(--solved); font-weight: 500;">Δ équipe préc.</div>
                                    <div style="font-size: 14px; color: var(--text); font-weight: 600;">+${escapeHtml(solve.timeDiffStr)}</div>
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
    // Protection contre les temps négatifs (ne devrait plus arriver avec les corrections amont)
    if (ms < 0) {
        console.warn(`⚠️ Temps négatif non corrigé en amont dans formatTimeDiffDetailed: ${ms}ms`);
        return "< 1m"; // Afficher un temps minimal
    }
    
    // Protection contre les temps très courts (moins de 10 secondes = probablement une erreur de données)
    if (ms < 10000) {
        debugLog(`⚠️ Temps très court détecté: ${ms}ms, probable erreur de données`);
        return "< 10s";
    }
    
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
        
        // Vérifier que nous sommes connectés
        if (!isConnected && !currentUser.token) {
            console.error(`❌ Connection check failed:`, {
                isConnected,
                hasToken: !!currentUser.token,
                userName: currentUser.name,
                ctfdUrl: currentUser.ctfdUrl
            });
            throw new Error('Non connecté à CTFd');
        }
        
        if (!isConnected && currentUser.token) {
            console.warn('⚠️ isConnected is false but we have a token - possible timing issue, attempting anyway');
        }
        
        // Charger les solves depuis l'API CTFd
        const team = teams.find(t => t.name === teamName);
        if (!team) {
            throw new Error(`Team ${teamName} not found in teams list`);
        }
        
        if (!team.id) {
            console.error(`Team object:`, team);
            console.error(`Available teams:`, teams.map(t => ({name: t.name, id: t.id})));
            throw new Error(`Team ${teamName} has no ID. Team object: ${JSON.stringify(team)}`);
        }
        
        debugLog(`🔄 Loading solves for team ${teamName} (ID: ${team.id}, Individual: ${team.isIndividual || false})`);
        
        // Vérifier que challengeMap n'est pas vide
        if (Object.keys(challengeMap).length === 0) {
            console.error(`❌ challengeMap is empty! Cannot process team data without challenges.`);
            throw new Error(`Cannot load team data: challengeMap is empty. Make sure challenges are loaded from CTFd first.`);
        }
        
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
                try {
                    solvesResponse = await callCTFdAPI(`/api/v1/teams/${team.id}/solves`);
                } catch (apiError) {
                    console.error(`Failed to load solves for team ${teamName} (ID: ${team.id}):`, apiError);
                    throw new Error(`API call failed for team ${teamName}: ${apiError.message}`);
                }
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
    window.customPositions = customPositions; // Sync with global
    debugLog('💾 Saved custom positions to session storage');
}

function resetChallengePositions() {
    customPositions = {};
    window.customPositions = customPositions; // Sync with global
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
                drawDependencies();
            }
        } else {
            renderChallenges();
            drawDependencies();
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
        drawDependencies();
        
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

// Configuration des challenges - sera peuplé depuis CTFd
let challengeMap = {};

// FONCTION SUPPRIMÉE - PLUS DE MODE DÉMO
/*function updateDemoChallengePositions() {
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
}*/

// Supprimé - plus d'initialisation démo
// updateDemoChallengePositions();

function showCORSInstructions() {
    const instructions = 
`SOLUTIONS POUR CORRIGER L'ERREUR CORS :

1. PROXY CORS (Solution rapide)
   • Ajoutez "https://cors-anywhere.herokuapp.com/" devant votre URL CTFd
   • Exemple: https://cors-anywhere.herokuapp.com/https://demo.ctfd.io
   • À utiliser uniquement pour les tests

2. EXTENSION NAVIGATEUR (Recommandé pour le développement)
   • Chrome: "CORS Unblock" ou "Disable CORS"
   • Firefox: "CORS Everywhere" 
   • Désactivez après utilisation

3. CONFIGURATION CTFD (Solution permanente)
   Ajoutez dans la configuration CTFd:
   • Access-Control-Allow-Origin: *
   • Access-Control-Allow-Headers: Authorization, Content-Type
   • Access-Control-Allow-Methods: GET, POST, PUT, DELETE

4. HÉBERGEMENT LOCAL (Solution pro)
   • Hébergez cette page sur le même domaine que CTFd
   • Ou utilisez un reverse proxy (nginx, Apache)

5. ALTERNATIVE API
   • Utilisez l'interface CTFd directement
   • Ou développez un backend intermédiaire`;
    
    debugLog(instructions);
}

function showError(message) {
    const errorElement = document.getElementById('api-error');
    errorElement.innerHTML = `<strong>Erreur :</strong> ${escapeHtml(message)}`;
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
        teamSelect.insertAdjacentHTML(
            'beforeend',
            demoTeams.map(team => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`).join('')
        );
    }
}

// Fonction pour valider la connectivité CTFd
async function validateCTFdConnectivity(url) {
    try {
        showLoginLoader('Vérification de la connectivité CTFd...');
        
        // Normaliser l'URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        // Configurer le proxy avec la nouvelle URL AVANT de tester
        try {
            await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ctfdUrl: url })
            });
        } catch (e) {
            // Ignorer si le proxy n'est pas disponible
        }
        
        // Essayer de contacter l'endpoint de base
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`/`, {
            method: 'GET',
            signal: controller.signal,
            mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            debugLog('✅ CTFd accessible: HTTP', response.status);
            return { success: true, message: 'CTFd accessible' };
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
    } catch (error) {
        debugLog('❌ CTFd non accessible:', error);
        
        if (error.name === 'AbortError') {
            return { success: false, message: 'Timeout - CTFd non accessible' };
        } else if (error.message.includes('CORS')) {
            return { success: false, message: 'CORS_POLICY_ERROR' };
        } else {
            return { success: false, message: `Erreur de connectivité: ${error.message}` };
        }
    }
}

/**
 * Load and set user permissions based on API access
 */
async function loadUserPermissions() {
    if (!currentUser.token) {
        throw new Error('No user token available');
    }
    
    try {
        // 1. Vérifier le token et récupérer les infos utilisateur
        const userInfo = await callCTFdAPI('/api/v1/users/me', 'GET');
        currentUser.name = userInfo.data.name;
        currentUser.id = userInfo.data.id;
        
        // 2. Tester les permissions en tentant d'accéder aux endpoints admin
        let isAdmin = false;
        
        // Essayer plusieurs endpoints admin pour la compatibilité
        const adminEndpoints = [
            '/api/v1/admin/statistics',
            '/api/v1/users?view=admin',  // Endpoint plus standard
            '/api/v1/teams?view=admin'
        ];
        
        for (const endpoint of adminEndpoints) {
            try {
                await callCTFdAPI(endpoint, 'GET');
                // Si on arrive ici sans erreur, c'est un admin
                isAdmin = true;
                debugLog(`🔑 Permissions admin détectées via ${endpoint}`);
                break;
            } catch (error) {
                debugLog(`❌ Pas d'accès admin à ${endpoint}`);
                continue;
            }
        }
        
        // Définir les permissions basées sur le statut admin
        if (isAdmin) {
            userPermissions.isAdmin = true;
            userPermissions.canViewAllTeams = true;
            userPermissions.canManageTeams = true;
            userPermissions.canViewFutureChalls = true;
            console.log('✅ Permissions ADMIN définies:', userPermissions);
        } else {
            // L'utilisateur n'a pas les droits admin
            debugLog('👤 Mode joueur détecté - aucun accès admin');
            userPermissions.isAdmin = false;
            userPermissions.canViewAllTeams = false; // Joueur voit SA progression, pas multi-équipes
            userPermissions.canManageTeams = true;   // Mais peut gérer la liste des équipes
            userPermissions.canViewFutureChalls = false;
            console.log('✅ Permissions JOUEUR définies:', userPermissions);
        }
        
        return isAdmin;
    } catch (error) {
        // Gestion spécifique des erreurs d'authentification
        if (error.status === 401) {
            console.warn('❌ Authentication failed: Invalid token or insufficient permissions');
            const authError = new Error('AUTHENTICATION_FAILED');
            authError.status = 401;
            authError.originalError = error;
            throw authError;
        } else {
            console.error('Error loading user permissions:', error);
            throw error;
        }
    }
}

async function connectToAPI() {
    const ctfdUrl = document.getElementById('ctfd-url').value.trim();
    const token = document.getElementById('api-token').value.trim();
    
    // Validation des champs
    if (!ctfdUrl) {
        showError('Veuillez saisir l\'URL CTFd');
        return;
    }

    if (!token) {
        showError('Veuillez saisir votre token API CTFd');
        return;
    }

    // Normaliser l'URL
    let normalizedUrl = ctfdUrl;
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Mettre à jour le champ avec l'URL normalisée
    document.getElementById('ctfd-url').value = normalizedUrl;
    
    // Vérifier la connectivité CTFd d'abord (optionnel en mode proxy)
    const isProxyMode = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000';
    
    if (!isProxyMode) {
        const connectivity = await validateCTFdConnectivity(normalizedUrl);
        if (!connectivity.success) {
            hideLoginLoader();
            if (connectivity.message === 'CORS_POLICY_ERROR') {
                showCORSError();
            } else {
                showError(`Impossible d'accéder à CTFd: ${connectivity.message}`);
                showCORSInstructions();
            }
            return;
        }
    }

    updateAPIStatus('loading', 'Vérification du token...');
    
    // Si on utilise le proxy local, informer de la nouvelle URL
    if (isProxyMode) {
        try {
            await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ctfdUrl: normalizedUrl })
            });
            debugLog('📡 URL proxy mise à jour:', normalizedUrl);
        } catch (configError) {
            debugWarn('⚠️ Impossible de mettre à jour l\'URL du proxy:', configError);
        }
    }
    
    try {
        await authenticateWithCTFd(normalizedUrl, token);
    } catch (error) {
        updateAPIStatus('disconnected', 'Erreur de connexion');
        hideLoginLoader();
        
        if (error.message === 'CORS_POLICY_ERROR') {
            showCORSError();
        } else if (error.message === 'AUTHENTICATION_FAILED') {
            showAuthenticationError();
        } else {
            showError('Erreur de connexion à l\'API CTFd: ' + error.message);
        }
    }
}

async function authenticateWithCTFd(ctfdUrl, token) {
    // Réinitialiser les protections contre la duplication
    buildChallengeMapInProgress = false;
    buildChallengeMapCompleted = false;
    
    // Appel API pour vérifier le token et récupérer les permissions
    currentUser.ctfdUrl = ctfdUrl;
    currentUser.token = token;
    
    try {
        // Charger les permissions utilisateur
        showLoginLoader('Vérification du token...');
        showLoginLoader('Vérification des permissions...');
        const isAdmin = await loadUserPermissions();
        
        // Mettre à jour le statut de connexion
        updateAPIStatus('connected', 'Connecté');
        
        // 3. Vérifier l'état du CTF (seulement pour les admins)
        let ctfName = 'CTF';
        let startTime = null;
        
        if (userPermissions.isAdmin) {
            try {
                const configResponse = await callCTFdAPI('/api/v1/configs');
                debugLog('Configuration CTFd:', configResponse.data);
                
                // Vérifier si le CTF est en mode setup ou fini
                ctfName = configResponse.data?.ctf_name || 'CTF';
                startTime = configResponse.data?.start || null;
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
                debugLog('Impossible de récupérer la config CTFd (admin requis):', e);
            }
        } else {
            debugLog('💡 Mode joueur: Pas d\'accès aux configurations CTFd (normal)');
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

/**
 * Determine if an API error is expected and should not spam logs
 */
function isExpectedApiError(url, status) {
    // 401 errors that are handled gracefully
    if (status === 401) {
        return (
            url.includes('/api/v1/users/me')            // Authentication check endpoint
        );
    }
    
    // 403 errors that are expected
    if (status === 403) {
        return (
            url.includes('/api/v1/admin/') ||           // Admin endpoints when not admin
            url.includes('/api/v1/configs') ||          // Config access often restricted
            url.includes('/requirements') ||            // Requirements endpoint often restricted
            url.includes('view=admin')                  // Admin view parameters
        );
    }
    
    // 404 errors that are expected  
    if (status === 404) {
        return (
            url.includes('/api/v1/admin/statistics') || // Not all CTFd versions have this
            url.includes('/api/v1/admin/') ||           // Admin endpoints may not exist
            url.includes('/requirements') ||            // Requirements feature may not be available
            url.includes('view=admin')                  // Admin views may not be available
        );
    }
    
    return false;
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
    const isLocalProxy = true; // Toujours utiliser le proxy
    
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
        credentials: 'omit', // Ne pas envoyer de cookies
        redirect: 'manual' // Ne pas suivre les redirections automatiquement
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
        
        // Traiter les redirections manuellement
        if (response.type === 'opaqueredirect' || response.status === 0) {
            // C'est une redirection, probablement vers login
            const error = new Error('HTTP 302: Redirection vers login');
            error.status = 302;
            error.details = 'TOKEN_AUTH_NOT_SUPPORTED';
            throw error;
        }
        
        if (!response.ok) {
            // Gestion contextuelle des erreurs pour éviter le spam de logs
            const isExpectedError = isExpectedApiError(url, response.status);
            
            if (isExpectedError) {
                debugLog(`Expected API error: ${response.status} for ${url}`);
            } else {
                console.error('Erreur HTTP:', response.status, 'pour', url);
            }
            
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
    try {
        debugLog(`🔍 === DÉBUT CHARGEMENT DONNÉES ===`);
        debugLog(`Mode de chargement des données: ${userPermissions.isAdmin ? 'ADMIN' : 'JOUEUR'}`);
        debugLog(`Permissions détectées:`, userPermissions);
        debugLog(`ChallengeMap actuel avant chargement: ${Object.keys(challengeMap).length} challenges`);
        
        if (userPermissions.isAdmin) {
            debugLog('📊 === DÉBUT CHARGEMENT ADMIN ===');
            await loadAdminData();
            debugLog('📊 === FIN CHARGEMENT ADMIN ===');
        } else {
            debugLog('👤 === DÉBUT CHARGEMENT JOUEUR ===');
            await loadUserData();
            debugLog('👤 === FIN CHARGEMENT JOUEUR ===');
        }
        
        debugLog(`ChallengeMap final après chargement: ${Object.keys(challengeMap).length} challenges`);
        debugLog(`🔍 === FIN CHARGEMENT DONNÉES ===`);
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error);
        
        // Fallback: Au minimum charger les challenges visibles (seulement si aucun challenge n'est chargé)
        if (Object.keys(challengeMap).length === 0) {
            try {
                debugLog('🔄 Tentative de chargement minimal des challenges...');
                await loadMinimalChallenges();
            } catch (fallbackError) {
                console.error('❌ Échec du chargement minimal:', fallbackError);
                throw error; // Rethrow l'erreur originale
            }
        } else {
            debugLog('⚠️ Des challenges sont déjà chargés, pas de fallback nécessaire');
        }
    }
}

// Fonction de fallback pour charger au minimum les challenges
async function loadMinimalChallenges() {
    try {
        const challengesResponse = await callCTFdAPI('/api/v1/challenges');
        
        if (challengesResponse && challengesResponse.data) {
            challengeMap = {};
            
            challengesResponse.data.forEach(challenge => {
                challengeMap[String(challenge.id)] = {
                    id: String(challenge.id),
                    name: challenge.name || 'Challenge sans nom',
                    category: challenge.category || 'General',
                    points: challenge.value || 0,
                    dependencies: [], // Pas de dépendances en mode minimal
                    position: null
                };
            });
            
            debugLog(`✅ Chargement minimal: ${Object.keys(challengeMap).length} challenges`);
            
            // Appliquer un positionnement simple
            applyBasicPositioning();
            
            // Créer une équipe fictive pour l'utilisateur courant
            teams = [{
                id: 'user',
                name: currentUser.name || 'Mon équipe',
                color: '#3b82f6'
            }];
            
            window.teams = teams;
            selectedTeams = [teams[0].name];
            window.selectedTeams = selectedTeams;
            
            debugLog('✅ Mode minimal activé - Challenges visibles sans progression');
        }
    } catch (error) {
        console.error('❌ Échec du chargement minimal des challenges:', error);
        throw error;
    }
}

// Fonction pour appliquer un positionnement simple en grille
function applyBasicPositioning() {
    const challengeIds = Object.keys(challengeMap);
    const cols = Math.ceil(Math.sqrt(challengeIds.length));
    const spacing = 200;
    const startX = 100;
    const startY = 100;
    
    challengeIds.forEach((id, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        challengeMap[id].position = {
            x: startX + col * spacing,
            y: startY + row * spacing
        };
    });
    
    debugLog(`✅ Positionnement de base appliqué: ${challengeIds.length} challenges en grille ${cols}x${Math.ceil(challengeIds.length / cols)}`);
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
            const teamsTestResponse = await callCTFdAPI(`/api/v1/teams?page=1${userPermissions.isAdmin ? '&view=admin' : ''}`);
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
                const usersResponse = await callCTFdAPI(`/api/v1/users?page=${page}${userPermissions.isAdmin ? '&view=admin' : ''}`);
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
                hidden: user.hidden || false,
                banned: user.banned || false,
                isIndividual: true
            })));
            
            return;
        }
        
        // Mode équipe standard
        while (hasMore) {
            showLoginLoader(`Chargement des équipes (page ${page})...`);
            const teamsResponse = await callCTFdAPI(`/api/v1/teams?page=${page}${userPermissions.isAdmin ? '&view=admin' : ''}`);
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
            hidden: team.hidden || false,
            banned: team.banned || false,
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
        
        // Pour les admins, sélectionner automatiquement les 10 premières équipes
        // (ou moins si moins d'équipes disponibles)
        const initialTeams = teams.slice(0, 10).map(t => t.name);
        setSelectedTeams(initialTeams);
        debugLog(`🎯 Admin: Auto-sélection de ${initialTeams.length} équipes initiales`);
        
        // Charger la progression de ces équipes
        for (const teamName of initialTeams) {
            try {
                await loadTeamProgress(teamName);
            } catch (error) {
                debugLog(`⚠️ Impossible de charger la progression de ${teamName}:`, error);
            }
        }
        
        // Mettre à jour la visualisation après chargement des progressions
        debugLog('🎨 Mise à jour de la visualisation après chargement des progressions admin');
        if (d3SystemReady && window.renderD3Challenges) {
            setTimeout(() => updateVisualization(), 100);
        }
        
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
        buildChallengeMapInProgress = false;
        buildChallengeMapCompleted = true;
        
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
        
        // Ne plus charger automatiquement les données - elles seront chargées lors de la sélection manuelle
        
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
            debugLog(`🔍 Récupération du profil utilisateur ID: ${currentUser.id}`);
            userTeamResponse = await callCTFdAPI(`/api/v1/users/${currentUser.id}`);
            teamId = userTeamResponse.data.team_id;
            debugLog(`👥 Team ID trouvé dans le profil: ${teamId}`);
            debugLog(`📋 Données du profil utilisateur:`, userTeamResponse.data);
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
                currentUser.teamName = teamResponse.data.name;
                
                // Essayer de charger toutes les équipes visibles (pas juste la sienne)
                try {
                    debugLog('🏁 Tentative de chargement de toutes les équipes visibles...');
                    debugLog(`👥 Équipes avant preloadAllTeams: ${teams.length}`);
                    await preloadAllTeams();
                    debugLog(`👥 Équipes après preloadAllTeams: ${teams.length}`);
                    
                    // S'assurer que l'équipe du joueur est sélectionnée
                    if (!selectedTeams.includes(currentUser.teamName)) {
                        debugLog(`🔄 Sélection de l'équipe du joueur: ${currentUser.teamName}`);
                        setSelectedTeams([currentUser.teamName]);
                    }
                } catch (allTeamsError) {
                    debugLog('❌ Impossible de charger toutes les équipes, mode équipe unique:', allTeamsError);
                    // Fallback: juste l'équipe du joueur
                    teams = [{
                        id: teamId,
                        name: teamResponse.data.name,
                        color: '#3b82f6'
                    }];
                    setSelectedTeams([teamResponse.data.name]);
                }
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
        buildChallengeMapInProgress = false;
        buildChallengeMapCompleted = true;
        
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
        
        // S'assurer que l'équipe de l'utilisateur est bien sélectionnée
        debugLog(`🔍 Vérification sélection équipe utilisateur:`);
        debugLog(`  - currentUser.teamName: "${currentUser.teamName}"`);
        debugLog(`  - selectedTeams: [${selectedTeams.map(t => `"${t}"`).join(', ')}]`);
        debugLog(`  - L'équipe est-elle incluse? ${selectedTeams.includes(currentUser.teamName)}`);
        
        if (currentUser.teamName && (!selectedTeams.includes(currentUser.teamName))) {
            debugLog('🔄 Sélection automatique de l\'équipe utilisateur:', currentUser.teamName);
            setSelectedTeams([currentUser.teamName]);
            debugLog(`  ✅ Équipe sélectionnée. Nouvelles selectedTeams: [${selectedTeams.map(t => `"${t}"`).join(', ')}]`);
        } else {
            debugLog('✅ Équipe utilisateur déjà sélectionnée ou pas de teamName');
        }
        
        // La mise à jour de l'affichage sera faite par initializeInterface après l'init D3
        debugLog('🎨 Données utilisateur chargées, affichage sera mis à jour après init D3');
        
        // Garder les contrôles équipes mais désactiver les fonctions admin uniquement
        const pathsBtn = document.getElementById('paths-btn');
        const heatmapBtn = document.getElementById('heatmap-btn');
        
        // Les fonctions parcours et heatmap nécessitent souvent des données admin
        if (pathsBtn) pathsBtn.classList.add('disabled');
        if (heatmapBtn) heatmapBtn.classList.add('disabled');
        
        debugLog('✅ Interface joueur configurée - Fonctions admin désactivées, équipes visibles');
        
    } catch (error) {
        console.error('Erreur lors du chargement des données utilisateur:', error);
        showError('Erreur de chargement: ' + error.message + '. Vérifiez que l\'API CTFd est accessible.');
    }
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
    
    // D'abord, créer une map des challenges résolus
    const solvedChallenges = new Set();
    userSolves.forEach(solve => {
        solvedChallenges.add(String(solve.challenge_id));
    });
    
    // Ensuite, traiter tous les challenges
    Object.entries(challengeMap).forEach(([challengeId, challengeInfo]) => {
        const solved = solvedChallenges.has(challengeId);
        const solve = solved ? userSolves.find(s => String(s.challenge_id) === challengeId) : null;
        
        // Vérifier si les dépendances sont résolues
        const dependenciesResolved = challengeInfo.dependencies.every(dep => 
            solvedChallenges.has(dep)
        );
        
        // Déterminer si le challenge est verrouillé
        const locked = challengeInfo.dependencies.length > 0 && !dependenciesResolved;
        
        // Simulation des tentatives (CTFd ne stocke que les résolutions)
        const attempts = solved ? Math.floor(Math.random() * 3) + 1 : 0;
        const timeSpent = solved ? Math.floor(Math.random() * 60) + 10 : 0;
        
        teamProgress[teamName][challengeId] = {
            solved: solved,
            attempted: solved, // Nous n'avons que les résolutions dans CTFd
            locked: locked,
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
    
    // S'assurer que selectedTeams est vide après reconnexion SEULEMENT pour les admins
    // Les utilisateurs non-admin doivent garder leur équipe sélectionnée
    if (selectedTeams.length > 0 && userPermissions.canViewAllTeams) {
        debugLog('⚠️ Réinitialisation des équipes sélectionnées après reconnexion (mode admin)');
        setSelectedTeams([]);
    } else if (!userPermissions.canViewAllTeams && selectedTeams.length === 0) {
        // Pour les utilisateurs non-admin, s'assurer que leur équipe est sélectionnée
        debugLog('🔄 Sélection automatique de l\'équipe pour l\'utilisateur non-admin');
        if (currentUser.teamName) {
            setSelectedTeams([currentUser.teamName]);
        }
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
        
        // Pour les utilisateurs non-admin, la première visualisation déjà faite suffit
        // Plus besoin de double appel avec le nouveau système D3
        if (!userPermissions.isAdmin && currentUser.teamName && selectedTeams.includes(currentUser.teamName)) {
            debugLog('🎯 Affichage automatique de la progression pour l\'utilisateur:', currentUser.teamName);
            // La progression est déjà prise en compte par updateVisualization() au-dessus
        }
    }, 100);
}

function generateTeamFilters(searchTerm = '') {
    console.log('🔍 generateTeamFilters called:', {
        canManageTeams: userPermissions.canManageTeams,
        isAdmin: userPermissions.isAdmin,
        canViewAllTeams: userPermissions.canViewAllTeams,
        userPermissions: userPermissions
    });
    
    if (!userPermissions.canManageTeams) {
        console.warn('❌ generateTeamFilters blocked: canManageTeams is false');
        // TEMPORARY FIX: Force team management for debugging
        console.warn('🔧 TEMPORARY: Forcing team filters generation despite permissions');
        // return;
    }
    
    const container = document.getElementById('team-filters');

    // Listener délégué attaché une seule fois sur le conteneur : survit aux ré-renders innerHTML
    // et évite d'injecter team.name dans un handler inline (CSP-friendly).
    if (container && !container.dataset.toggleListenerAttached) {
        container.addEventListener('change', (e) => {
            const input = e.target;
            if (input && input.matches && input.matches('input.team-checkbox-input')) {
                const teamName = input.dataset.teamName;
                if (teamName) toggleTeam(teamName, input);
            }
        });
        container.dataset.toggleListenerAttached = 'true';
    }

    // Ajouter barre de recherche et filtres si pas déjà présents
    let searchBar = document.getElementById('team-search-container');
    if (!searchBar) {
        searchBar = document.createElement('div');
        searchBar.id = 'team-search-container';
        searchBar.style.position = 'relative';
        searchBar.innerHTML = `
            <input type="text" 
                   id="team-search" 
                   placeholder="Rechercher une équipe (Entrée pour sélectionner)" 
                   style="width: 100%; padding: 8px 80px 8px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; background: var(--surface-2); color: var(--text);"
                   oninput="searchTeams(this.value)"
                   onkeydown="handleSearchKeydown(event)">
            <div style="position: absolute; right: 0; top: 0; display: flex;">
                <button 
                    onclick="selectFirstSearchResult()"
                    style="padding: 8px 6px; font-size: 11px; border: none; border-left: 1px solid var(--border); cursor: pointer; background: var(--surface-2); color: var(--solved);"
                    title="Sélectionner la première équipe trouvée">
                    ✓
                </button>
                <button 
                    onclick="clearSearch()"
                    style="padding: 8px 6px; font-size: 11px; border: none; border-left: 1px solid var(--border); cursor: pointer; background: var(--surface-2); color: var(--danger); border-radius: 0 4px 4px 0;"
                    title="Effacer la recherche">
                    ✗
                </button>
            </div>
            ${userPermissions.isAdmin ? `
            <div style="margin-bottom: 10px; display: flex; gap: 5px; flex-wrap: wrap;">
                <button 
                    id="filter-active"
                    onclick="toggleTeamStatusFilter('active')"
                    style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: ${teamStatusFilters.active ? 'var(--solved-bg)' : 'var(--surface-2)'}; color: ${teamStatusFilters.active ? 'var(--solved)' : 'var(--text-dim)'};">
                    Actives
                </button>
                <button 
                    id="filter-hidden"
                    onclick="toggleTeamStatusFilter('hidden')"
                    style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: ${teamStatusFilters.hidden ? 'rgba(155, 124, 216, 0.14)' : 'var(--surface-2)'}; color: ${teamStatusFilters.hidden ? '#b9a3e3' : 'var(--text-dim)'};">
                    Cachées
                </button>
                <button 
                    id="filter-banned"
                    onclick="toggleTeamStatusFilter('banned')"
                    style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; background: ${teamStatusFilters.banned ? 'var(--danger-bg)' : 'var(--surface-2)'}; color: ${teamStatusFilters.banned ? 'var(--danger)' : 'var(--text-dim)'};">
                    Bannies
                </button>
                <div style="flex: 1;"></div>
                <button 
                    onclick="selectAllVisibleTeams()"
                    style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--solved); border-radius: 4px; cursor: pointer; background: transparent; color: var(--solved);">
                    ✓ Tout
                </button>
                <button 
                    onclick="deselectAllVisibleTeams()"
                    style="padding: 4px 8px; font-size: 11px; border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; background: transparent; color: var(--danger);">
                    ✗ Aucun
                </button>
            </div>
            ` : ''}
        `;
        container.parentElement.insertBefore(searchBar, container);
    }
    
    // Filtrer les équipes selon la recherche et le statut
    let filteredTeams = teams.filter(team => {
        // Filtre de recherche
        if (!team.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        
        // Filtres de statut (seulement pour les admins)
        if (userPermissions.isAdmin) {
            // Si l'équipe est cachée et qu'on ne veut pas voir les cachées
            if (team.hidden && !teamStatusFilters.hidden) {
                return false;
            }
            // Si l'équipe est bannie et qu'on ne veut pas voir les bannies
            if (team.banned && !teamStatusFilters.banned) {
                return false;
            }
            // Si l'équipe est active (ni cachée ni bannie) et qu'on ne veut pas voir les actives
            if (!team.hidden && !team.banned && !teamStatusFilters.active) {
                return false;
            }
        }
        
        return true;
    });
    
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
            progressText = 'Chargement…';
        } else if (isCacheValid(team.name) || teamProgress[team.name]) {
            const solvedCount = getTeamSolvedCount(team.name);
            progressText = `${solvedCount}/${totalChallenges}`;
        } else {
            progressText = 'Non chargé';
        }
        
        // Ajouter des indicateurs pour les équipes cachées/bannies
        let statusIndicator = '';
        let teamStyle = '';
        if (team.hidden) {
            statusIndicator = ' (cachée)';
            teamStyle = 'opacity: 0.7;';
        }
        if (team.banned) {
            statusIndicator = ' (bannie)';
            teamStyle = 'opacity: 0.5; text-decoration: line-through;';
        }
        
        // Mettre en évidence la première équipe si on est en mode recherche
        const isFirstResult = searchTerm && filteredTeams[0] === team;
        const highlightStyle = isFirstResult ? 'background: var(--accent-bg); border: 1px solid var(--accent); border-radius: 4px; margin: 1px;' : '';
        
        const titleParts = [];
        if (team.hidden) titleParts.push('Équipe cachée');
        if (team.banned) titleParts.push('Équipe bannie');
        if (isFirstResult) titleParts.push('Appuyez sur Entrée pour sélectionner');
        return `
            <label class="team-checkbox" style="${teamStyle}${highlightStyle}" title="${escapeHtml(titleParts.join(' - '))}">
                <input type="checkbox" class="team-checkbox-input" data-team-name="${escapeHtml(team.name)}" ${isChecked ? 'checked' : ''}>
                <div class="team-color" style="background: ${escapeHtml(team.color)};"></div>
                <span class="team-name">${escapeHtml(team.name)}${statusIndicator}${isFirstResult ? ' ↵' : ''}</span>
                <span class="team-progress">${escapeHtml(progressText)}</span>
            </label>
        `;
    }).join('');
    
    // Afficher le nombre de résultats avec options de sélection
    if (searchTerm) {
        const unselectedCount = filteredTeams.filter(team => !selectedTeams.includes(team.name)).length;
        container.innerHTML = `<div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span>${filteredTeams.length} équipe(s) trouvée(s)${unselectedCount > 0 ? ` (${unselectedCount} non sélectionnée(s))` : ''}</span>
            ${unselectedCount > 0 ? `
                <button 
                    onclick="selectAllVisibleTeams()"
                    style="padding: 2px 6px; font-size: 10px; border: 1px solid var(--solved); border-radius: 3px; cursor: pointer; background: transparent; color: var(--solved);">
                    ✓ Toutes
                </button>
            ` : ''}
        </div>` + container.innerHTML;
    }
}

// Fonction de recherche d'équipes
function searchTeams(searchTerm) {
    generateTeamFilters(searchTerm);
}

// Fonction pour gérer les touches dans la barre de recherche
async function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        await selectFirstSearchResult();
    }
}

// Fonction pour sélectionner la première équipe trouvée dans la recherche
async function selectFirstSearchResult() {
    const searchTerm = document.getElementById('team-search')?.value || '';
    if (!searchTerm.trim()) return;
    
    // Obtenir les équipes filtrées
    const filteredTeams = teams.filter(team => {
        // Filtre de recherche
        if (!team.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        
        // Filtres de statut (seulement pour les admins)
        if (userPermissions.isAdmin) {
            if (team.hidden && !teamStatusFilters.hidden) return false;
            if (team.banned && !teamStatusFilters.banned) return false;
            if (!team.hidden && !team.banned && !teamStatusFilters.active) return false;
        }
        
        return true;
    });
    
    if (filteredTeams.length > 0) {
        const teamToSelect = filteredTeams[0];
        
        // Vérifier si l'équipe n'est pas déjà sélectionnée
        if (!selectedTeams.includes(teamToSelect.name)) {
            // Ajouter l'équipe à la sélection (sélection additive)
            const newSelection = [...selectedTeams, teamToSelect.name];
            setSelectedTeams(newSelection);
            
            // Charger les données si nécessaire
            if (!teamProgress[teamToSelect.name] && !loadingTeams.has(teamToSelect.name)) {
                await loadTeamDataLazy(teamToSelect.name);
            }
            
            debugLog(`🎯 Équipe "${teamToSelect.name}" sélectionnée via recherche`);
        }
        
        // Vider la recherche après sélection
        document.getElementById('team-search').value = '';
        generateTeamFilters('');
        updateVisualization();
    }
}

// Fonction pour effacer la recherche
function clearSearch() {
    document.getElementById('team-search').value = '';
    generateTeamFilters('');
}

// Fonction pour basculer les filtres de statut d'équipe
function toggleTeamStatusFilter(status) {
    teamStatusFilters[status] = !teamStatusFilters[status];
    
    // Mettre à jour l'apparence du bouton
    const button = document.getElementById(`filter-${status}`);
    if (button) {
        const isActive = teamStatusFilters[status];
        let bgColor, textColor;
        
        switch(status) {
            case 'active':
                bgColor = isActive ? 'var(--solved-bg)' : 'var(--surface-2)';
                textColor = isActive ? 'var(--solved)' : 'var(--text-dim)';
                break;
            case 'hidden':
                bgColor = isActive ? 'rgba(155, 124, 216, 0.14)' : 'var(--surface-2)';
                textColor = isActive ? '#b9a3e3' : 'var(--text-dim)';
                break;
            case 'banned':
                bgColor = isActive ? 'var(--danger-bg)' : 'var(--surface-2)';
                textColor = isActive ? 'var(--danger)' : 'var(--text-dim)';
                break;
        }
        
        button.style.background = bgColor;
        button.style.color = textColor;
    }
    
    // Sauvegarder l'état des filtres
    localStorage.setItem('teamStatusFilters', JSON.stringify(teamStatusFilters));
    
    // Régénérer la liste filtrée
    const searchTerm = document.getElementById('team-search')?.value || '';
    generateTeamFilters(searchTerm);
}

// Fonction pour sélectionner toutes les équipes visibles (filtrées)
async function selectAllVisibleTeams() {
    const searchTerm = document.getElementById('team-search')?.value || '';
    
    // Obtenir les équipes filtrées
    const filteredTeams = teams.filter(team => {
        // Filtre de recherche
        if (!team.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        
        // Filtres de statut (seulement pour les admins)
        if (userPermissions.isAdmin) {
            if (team.hidden && !teamStatusFilters.hidden) return false;
            if (team.banned && !teamStatusFilters.banned) return false;
            if (!team.hidden && !team.banned && !teamStatusFilters.active) return false;
        }
        
        return true;
    });
    
    // Ajouter toutes les équipes filtrées à la sélection
    const newSelection = [...selectedTeams];
    for (const team of filteredTeams) {
        if (!newSelection.includes(team.name)) {
            newSelection.push(team.name);
            
            // Charger les données si nécessaire
            if (!teamProgress[team.name] && !loadingTeams.has(team.name)) {
                await loadTeamDataLazy(team.name);
            }
        }
    }
    
    // Sauvegarder et mettre à jour
    setSelectedTeams(newSelection);
    generateTeamFilters(searchTerm);
    updateVisualization();
}

// Fonction pour désélectionner toutes les équipes visibles (filtrées)
function deselectAllVisibleTeams() {
    const searchTerm = document.getElementById('team-search')?.value || '';
    
    // Obtenir les équipes filtrées
    const filteredTeams = teams.filter(team => {
        // Filtre de recherche
        if (!team.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        
        // Filtres de statut (seulement pour les admins)
        if (userPermissions.isAdmin) {
            if (team.hidden && !teamStatusFilters.hidden) return false;
            if (team.banned && !teamStatusFilters.banned) return false;
            if (!team.hidden && !team.banned && !teamStatusFilters.active) return false;
        }
        
        return true;
    });
    
    // Retirer toutes les équipes filtrées de la sélection
    const filteredNames = filteredTeams.map(t => t.name);
    const newSelectedTeams = selectedTeams.filter(name => !filteredNames.includes(name));
    
    // Sauvegarder et mettre à jour
    setSelectedTeams(newSelectedTeams);
    generateTeamFilters(searchTerm);
    updateVisualization();
}

// Fonction de tri des équipes
function sortTeamsBy(mode) {
    if (mode === 'selected') {
        // Toggle pour afficher seulement les équipes sélectionnées
        showOnlySelected = !showOnlySelected;
        document.getElementById('sort-selected-btn').style.background = showOnlySelected ? 'var(--accent-bg)' : 'var(--surface-2)';
        document.getElementById('sort-selected-btn').style.color = showOnlySelected ? 'var(--accent)' : 'var(--text-dim)';
        document.getElementById('sort-selected-btn').textContent = showOnlySelected ? 'Sélection seule' : 'Sélection';
    } else {
        teamSortMode = mode;
        showOnlySelected = false; // Reset le filtre quand on change de tri
        
        // Mettre à jour l'apparence des boutons
        document.getElementById('sort-score-btn').style.background = mode === 'score' ? 'var(--accent-bg)' : 'var(--surface-2)';
        document.getElementById('sort-score-btn').style.color = mode === 'score' ? 'var(--accent)' : 'var(--text-dim)';
        document.getElementById('sort-name-btn').style.background = mode === 'name' ? 'var(--accent-bg)' : 'var(--surface-2)';
        document.getElementById('sort-name-btn').style.color = mode === 'name' ? 'var(--accent)' : 'var(--text-dim)';
        document.getElementById('sort-selected-btn').style.background = 'var(--surface-2)';
        document.getElementById('sort-selected-btn').style.color = 'var(--text-dim)';
        document.getElementById('sort-selected-btn').textContent = 'Sélection';
        
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
        // Vérifier que les challenges sont chargés avant de charger les données d'équipe
        if (Object.keys(challengeMap).length === 0) {
            checkbox.checked = false;
            alert('Les challenges ne sont pas encore chargés. Attendez que la connexion à CTFd soit terminée.');
            return;
        }
        
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
            updateVisualization();
            debugLog(`Team ${teamName} added to view`);
        } catch (error) {
            // Remove from selection if loading failed
            setSelectedTeams(selectedTeams.filter(t => t !== teamName));
            checkbox.checked = false;
            console.error(`Failed to load team ${teamName}:`, error);
            
            // Show user-friendly error message
            if (error.message.includes('Non connecté')) {
                const debugInfo = `
Debug info:
- isConnected: ${isConnected}
- currentUser.token exists: ${!!currentUser.token}
- currentUser.name: ${currentUser.name}
- Team attempting to load: ${teamName}`;
                console.error(debugInfo);
                alert('Impossible de charger les données de l\'équipe.\n\nVérifiez que vous êtes bien connecté à CTFd et réessayez.\n\nConsultez la console pour plus de détails.');
            }
            console.error('Error details:', error.message, error.stack);
        }
    } else {
        // Remove team from selection
        setSelectedTeams(selectedTeams.filter(t => t !== teamName));
        updateVisualization();
        updateVisualization();
        debugLog(`Team ${teamName} removed from view`);
    }
}

async function selectAllTeams() {
    if (!userPermissions.canManageTeams) return;
    
    const checkboxes = document.querySelectorAll('#team-filters input[type="checkbox"]');
    const newSelection = [...selectedTeams];
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const teamName = checkbox.parentElement.querySelector('.team-name').textContent;
        if (!newSelection.includes(teamName)) {
            newSelection.push(teamName);
        }
    });
    
    setSelectedTeams(newSelection);
    
    // Load data for newly selected teams
    const loadingPromises = newSelection.map(async (teamName) => {
        if (!teamProgress[teamName] && !loadingTeams.has(teamName)) {
            await loadTeamDataLazy(teamName);
        }
    });
    
    try {
        await Promise.all(loadingPromises);
        updateVisualization();
        updateVisualization();
        debugLog(`${newSelection.length} teams loaded`);
    } catch (error) {
        console.error('Some teams failed to load:', error);
    }
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
        
        // Show parcours toolbar (animation + export)
        setParcoursToolbarVisible(true);
        // Les tracés sont dessinés après le re-rendu D3 (voir renderD3Challenges),
        // sinon ils utilisent des positions périmées le temps que la simulation se stabilise.
        // Hide heatmap legend
        document.getElementById('heatmap-legend').classList.remove('visible');
    } else if (mode === 'heatmap') {
        heatmapMode = true;
        window.heatmapMode = true;
        parcoursMode = false;
        window.parcoursMode = false;
        debugLog('🔥 Mode Heatmap activé');
        
        // Hide parcours toolbar
        setParcoursToolbarVisible(false);

        // Clear paths if any
        if (d3SystemReady && window.d3Data && window.d3Data.pathGroup) {
            window.d3Data.pathGroup.selectAll('*').remove();
        }
        // Show heatmap legend
        document.getElementById('heatmap-legend').classList.add('visible');
        
        // Force D3 re-render for heatmap colors
        if (d3SystemReady && window.renderD3Challenges) {
            debugLog('🔥 Forçage du re-rendu D3 pour la heatmap');
            
            // Debug heatmap data
            const heatmapColors = window.getChallengeHeatmapColors();
            debugLog('🔥 Données heatmap calculées:', {
                challengeCount: Object.keys(heatmapColors).length,
                sampleColors: Object.entries(heatmapColors).slice(0, 5)
            });
            
            window.lastDataHash = null; // Reset hash to force re-render
            setTimeout(() => window.renderD3Challenges(), 50);
        }
    } else {
        parcoursMode = false;
        window.parcoursMode = false;
        heatmapMode = false;
        window.heatmapMode = false;
        debugLog('🗂️ Mode Overview activé');
        
        // Hide parcours toolbar
        setParcoursToolbarVisible(false);

        // Clear paths if any
        if (d3SystemReady && window.d3Data && window.d3Data.pathGroup) {
            window.d3Data.pathGroup.selectAll('*').remove();
        }
        // Hide heatmap legend
        document.getElementById('heatmap-legend').classList.remove('visible');
    }
    
    // Force re-render with updateVisualization but with hash reset for D3
    if (d3SystemReady) {
        window.lastDataHash = null; // Reset hash to force D3 re-render
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

function setParcoursToolbarVisible(visible) {
    const bar = document.getElementById('parcours-toolbar');
    if (bar) bar.style.display = visible ? 'flex' : 'none';
}

// Rend un panneau flottant déplaçable par sa poignée (titre)
function makePanelDraggable(panelId, handleSelector) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const handle = handleSelector ? panel.querySelector(handleSelector) : panel;
    if (!handle) return;
    let dragging = false, startX, startY, origX, origY;
    handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input, a')) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        const parentRect = panel.offsetParent.getBoundingClientRect();
        origX = rect.left - parentRect.left;
        origY = rect.top - parentRect.top;
        startX = e.clientX;
        startY = e.clientY;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        panel.style.left = `${origX + e.clientX - startX}px`;
        panel.style.top = `${origY + e.clientY - startY}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
    handle.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('pointercancel', () => { dragging = false; });
}

// Construit les données de parcours des équipes sélectionnées :
// résolutions triées chronologiquement, écarts entre résolutions, cumuls et résumé par équipe.
function buildParcoursExportData() {
    const exportTeams = [];

    selectedTeams.forEach(teamName => {
        const progress = teamProgress[teamName];
        if (!progress) return;

        const solves = [];
        Object.entries(progress).forEach(([challengeId, entry]) => {
            if ((entry.solved === true || entry.status === 'solved') && entry.date) {
                const challenge = challengeMap[challengeId] || {};
                solves.push({
                    challengeId: challengeId,
                    name: challenge.name || `Challenge ${challengeId}`,
                    category: challenge.category || 'General',
                    points: challenge.points || 0,
                    date: new Date(entry.date)
                });
            }
        });
        solves.sort((a, b) => a.date - b.date);
        if (solves.length === 0) return;

        const start = solves[0].date;
        let cumulativePoints = 0;
        const byCategory = {};
        const solveRows = solves.map((solve, i) => {
            cumulativePoints += solve.points;
            byCategory[solve.category] = (byCategory[solve.category] || 0) + 1;
            const sincePreviousMs = i > 0 ? solve.date - solves[i - 1].date : 0;
            const sinceStartMs = solve.date - start;
            return {
                order: i + 1,
                challengeId: solve.challengeId,
                name: solve.name,
                category: solve.category,
                points: solve.points,
                date: solve.date.toISOString(),
                sincePreviousMs: sincePreviousMs,
                sincePrevious: i > 0 ? formatTimeDiff(sincePreviousMs) : '-',
                sinceStartMs: sinceStartMs,
                sinceStart: formatTimeDiff(sinceStartMs),
                cumulativePoints: cumulativePoints
            };
        });

        const end = solves[solves.length - 1].date;
        const totalDurationMs = end - start;
        const gaps = solveRows.slice(1).map(r => r.sincePreviousMs);
        const avgGapMs = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

        exportTeams.push({
            name: teamName,
            totalSolved: solveRows.length,
            totalPoints: cumulativePoints,
            firstSolve: start.toISOString(),
            lastSolve: end.toISOString(),
            totalDurationMs: totalDurationMs,
            totalDuration: formatTimeDiff(totalDurationMs),
            avgGapMs: avgGapMs,
            avgGap: gaps.length > 0 ? formatTimeDiff(avgGapMs) : '-',
            byCategory: byCategory,
            solves: solveRows
        });
    });

    return {
        type: 'ctfd-map-parcours-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        ctfdUrl: currentUser.ctfdUrl || null,
        teams: exportTeams
    };
}

function buildParcoursMarkdown(data) {
    // Neutralise les valeurs venant du serveur CTFd (noms d'équipes/challenges) :
    // pas de retour à la ligne (casse les tables), échappement des caractères
    // de formatage exploitables pour injecter du Markdown (liens, images, code).
    const esc = (value) => String(value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[|\\`\[\]!]/g, '\\$&');
    const lines = [];
    lines.push('# Parcours des équipes');
    lines.push('');
    lines.push(`- Exporté le : ${new Date(data.exportedAt).toLocaleString('fr-FR')}`);
    if (data.ctfdUrl) lines.push(`- Instance CTFd : ${data.ctfdUrl}`);
    lines.push('');

    if (data.teams.length > 1) {
        lines.push('## Comparaison des équipes');
        lines.push('');
        lines.push('| Équipe | Résolutions | Points | Première résolution | Dernière résolution | Durée totale | Temps moyen entre résolutions |');
        lines.push('|---|---|---|---|---|---|---|');
        data.teams.forEach(team => {
            lines.push(`| ${esc(team.name)} | ${team.totalSolved} | ${team.totalPoints} | ${new Date(team.firstSolve).toLocaleString('fr-FR')} | ${new Date(team.lastSolve).toLocaleString('fr-FR')} | ${team.totalDuration} | ${team.avgGap} |`);
        });
        lines.push('');
    }

    data.teams.forEach(team => {
        lines.push(`## ${esc(team.name)}`);
        lines.push('');
        lines.push(`- **${team.totalSolved}** challenges résolus, **${team.totalPoints}** points`);
        lines.push(`- Durée totale : ${team.totalDuration} (du ${new Date(team.firstSolve).toLocaleString('fr-FR')} au ${new Date(team.lastSolve).toLocaleString('fr-FR')})`);
        lines.push(`- Temps moyen entre résolutions : ${team.avgGap}`);
        lines.push(`- Par catégorie : ${Object.entries(team.byCategory).map(([cat, n]) => `${cat} (${n})`).join(', ')}`);
        lines.push('');
        lines.push('| # | Challenge | Catégorie | Points | Résolu le | Δ précédent | Depuis le début | Cumul points |');
        lines.push('|---|---|---|---|---|---|---|---|');
        team.solves.forEach(solve => {
            lines.push(`| ${solve.order} | ${esc(solve.name)} | ${esc(solve.category)} | ${solve.points} | ${new Date(solve.date).toLocaleString('fr-FR')} | ${solve.sincePrevious} | ${solve.sinceStart} | ${solve.cumulativePoints} |`);
        });
        lines.push('');
    });

    return lines.join('\n');
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Exporte le parcours des équipes sélectionnées ('md' ou 'json')
function exportParcours(format) {
    if (selectedTeams.length === 0) {
        alert('Sélectionnez au moins une équipe pour exporter son parcours.');
        return;
    }

    const data = buildParcoursExportData();
    if (data.teams.length === 0) {
        alert('Aucune résolution datée trouvée pour les équipes sélectionnées.');
        return;
    }

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const teamSlug = data.teams.length === 1
        ? data.teams[0].name.replace(/[^a-zA-Z0-9_-]+/g, '_').substring(0, 40)
        : `${data.teams.length}-equipes`;

    if (format === 'json') {
        downloadFile(`parcours_${teamSlug}_${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
    } else {
        downloadFile(`parcours_${teamSlug}_${stamp}.md`, buildParcoursMarkdown(data), 'text/markdown');
    }
    debugLog(`📤 Parcours exporté (${format}) pour ${data.teams.length} équipe(s)`);
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
        else statusIcon = '⊘';
        
        // Indicateurs par équipe (seulement pour admin)
        let teamIndicators = '';
        if (userPermissions.canViewAllTeams) {
            teamIndicators = `
                <div class="challenge-team-indicator">
                    ${selectedTeams.slice(0, 5).map(teamName => { // Limiter à 5 équipes max pour la lisibilité
                        const team = teams.find(t => t.name === teamName);
                        const progress = getTeamProgress(teamName, challengeId);
                        
                        let dotColor = '#2e3947';
                        if (progress?.solved) dotColor = team.color;
                        else if (progress?.attempted) dotColor = '#f59e0b';
                        else if (progress?.locked) dotColor = '#9ca3af';
                        
                        return `<div class="team-mini-dot" style="background: ${escapeHtml(dotColor)};" title="${escapeHtml(teamName)}"></div>`;
                    }).join('')}
                </div>
            `;
        }
        
        node.innerHTML = `
            <div class="challenge-name">${escapeHtml(truncateText(challengeInfo.name, 18))}</div>
            <div class="challenge-category">${escapeHtml(truncateText(challengeInfo.category || 'General', 16))}</div>
            <div class="challenge-points">${Number(challengeInfo.points) || 0} pts</div>
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
    // Skip if D3 system is active
    if (d3SystemReady) {
        debugLog('📊 D3 system active, skipping legacy dependency drawing');
        return;
    }
    
    const svg = document.getElementById('dependencies-svg');
    if (!svg) {
        debugLog('⚠️ Dependencies SVG element not found (normal if using D3)');
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
        
        let content = `<strong>${escapeHtml(challengeInfo.name)}</strong><br>Points: ${Number(challengeInfo.points) || 0}<br><br>`;

        if (progress?.solved) {
            const failures = Math.max(0, (progress.attempts || 1) - 1);
            content += `<strong>Résolu</strong><br>Temps: ${Number(progress.timeSpent) || 0}min<br>Tentatives: ${Number(progress.attempts) || 1}`;
            if (failures > 0) content += `<br>Échecs: ${failures}`;
        } else if (progress?.attempted) {
            content += `<strong>Tenté</strong><br>Temps: ${Number(progress.timeSpent) || 0}min<br>Tentatives: ${Number(progress.attempts) || 1}<br>Échecs: ${Number(progress.attempts) || 1}`;
        } else {
            content += `<strong>Disponible</strong>`;
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
        
        let content = `<strong>${escapeHtml(challengeInfo.name)}</strong><br>Points: ${Number(challengeInfo.points) || 0}<br><br>`;

        if (solvedTeams.length > 0) {
            content += `<strong>Résolu par :</strong><br>`;
            solvedTeams.forEach(team => {
                const progress = getTeamProgress(team, challengeId);
                content += `• ${escapeHtml(team)} (${Number(progress.timeSpent) || 0}min, ${Number(progress.attempts) || 1} tent.)<br>`;
            });
        }

        if (attemptedTeams.length > 0) {
            content += `<br><strong>Tenté par :</strong><br>`;
            attemptedTeams.forEach(team => {
                const progress = getTeamProgress(team, challengeId);
                content += `• ${escapeHtml(team)} (${Number(progress.timeSpent) || 0}min, ${Number(progress.attempts) || 1} tent.)<br>`;
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


// Protection contre les appels trop fréquents à updateVisualization
let updateVisualizationInProgress = false;
let lastUpdateVisualizationCall = 0;

function updateVisualization() {
    console.log('📊 === updateVisualization appelé ===');
    console.log('🔍 Appelé depuis:', new Error().stack.split('\n')[2]);
    
    const now = Date.now();
    
    // Protection contre les appels trop rapprochés (moins de 50ms)
    if (updateVisualizationInProgress) {
        console.log('⚠️ updateVisualization déjà en cours, ignorant cet appel');
        return;
    }
    
    if (now - lastUpdateVisualizationCall < 50) {
        console.log('⚠️ updateVisualization appelé trop rapidement, ignorant cet appel');
        return;
    }
    
    updateVisualizationInProgress = true;
    lastUpdateVisualizationCall = now;
    
    generateChallengeMap();
    
    try {
        // Use D3 rendering if available and ready, fallback to legacy system
        if (d3SystemReady && window.renderD3Challenges && typeof isD3Ready === 'function' && isD3Ready()) {
            console.log('✅ Using D3 rendering system');
            renderD3Challenges();
            // Update team paths if parcours mode is active
            if (parcoursMode && window.updateTeamPaths) {
                setTimeout(() => window.updateTeamPaths(), 100); // Small delay to ensure nodes are positioned
            }
            // Don't call legacy functions when D3 is working
        } else {
            console.log('⚠️ D3 not ready, using legacy rendering');
            drawDependencies();
            updateTransform(); // Ensure SVG follows challenge container
        }
        
        generateTeamFilters();
        updateGlobalStats();
    } finally {
        // Reset flag after completion
        setTimeout(() => {
            updateVisualizationInProgress = false;
        }, 25);
    }
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

function calculateTeamScore(teamName) {
    if (!teamProgress[teamName]) return 0;
    return Object.entries(teamProgress[teamName])
        .filter(([id, progress]) => progress.solved)
        .reduce((sum, [id, progress]) => sum + (challengeMap[id]?.points || 0), 0);
}

function updateAPIStatus(status, message, targetUrl) {
    const indicator = document.getElementById('api-indicator');
    const text = document.getElementById('api-status-text');
    const urlDisplay = document.getElementById('ctfd-url-display');
    
    indicator.className = `status-indicator status-${status}`;
    text.textContent = message;
    
    // Afficher l'URL du CTFd si connecté (ou la cible du proxy avant connexion)
    const displayUrl = targetUrl || currentUser.ctfdUrl;
    if ((status === 'connected' || status === 'proxy') && displayUrl && urlDisplay) {
        urlDisplay.textContent = displayUrl;
        urlDisplay.style.display = 'block';
    } else if (urlDisplay) {
        urlDisplay.textContent = '';
        urlDisplay.style.display = 'none';
    }
    
    const wasConnected = isConnected;
    
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
    
    // Log connection state changes for debugging
    if (wasConnected !== isConnected) {
        console.log(`🔄 Connection state changed: ${wasConnected} → ${isConnected} (status: ${status}, message: ${message})`);
    }
}

function showCORSError() {
    const errorElement = document.getElementById('api-error');
    if (!errorElement) return;
    
    errorElement.innerHTML = 
`<strong>Erreur CORS détectée</strong><br><br>
Le serveur CTFd ne permet pas les requêtes cross-origin depuis cette page.<br><br>
<strong>Solutions possibles :</strong><br>
1. <strong>Proxy CORS :</strong> Utilisez un proxy comme <code>https://cors-anywhere.herokuapp.com/</code><br>
2. <strong>Extension navigateur :</strong> Installez "CORS Unblock" ou "CORS Toggle"<br>
3. <strong>Serveur local :</strong> Hébergez cette page sur le même domaine que CTFd<br>
4. <strong>Configuration CTFd :</strong> Ajoutez les headers CORS dans CTFd<br><br>
<button class="demo-btn" onclick="useCORSProxy()">Essayer avec proxy CORS</button>
<button class="demo-btn" onclick="showCORSInstructions()">Instructions détaillées</button>`;
    
    errorElement.style.display = 'block';
}

function showAuthenticationError() {
    const errorElement = document.getElementById('api-error');
    if (!errorElement) return;
    
    errorElement.innerHTML = 
`<strong>Erreur d'authentification</strong><br><br>
L'accès à l'API CTFd a été refusé. Cela peut être dû à :<br><br>
<strong>Causes possibles :</strong><br>
1. <strong>Token invalide :</strong> Vérifiez que votre token API est correct<br>
2. <strong>Token expiré :</strong> Régénérez un nouveau token dans CTFd<br>
3. <strong>Permissions insuffisantes :</strong> Votre compte n'a pas les droits API<br>
4. <strong>URL incorrecte :</strong> Vérifiez l'URL de votre instance CTFd<br><br>
<strong>Comment corriger :</strong><br>
• Allez dans <em>Settings → API Key</em> dans CTFd<br>
• Créez/régénérez votre token API<br>
• Copiez le token complet (commence par <code>ctf_</code>)<br>
• Vérifiez que l'URL CTFd est accessible<br><br>
<button class="demo-btn" onclick="document.getElementById('api-token').focus()">Modifier le token</button>
<button class="demo-btn" onclick="document.getElementById('ctfd-url').focus()">Modifier l'URL</button>`;
    
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
`INSTALLATION RAPIDE - 3 OPTIONS

OPTION 1 : Extension Chrome/Firefox (30 secondes)
1. Installez "Allow CORS" ou "CORS Unblock"
2. Ouvrez ce fichier HTML directement
3. Activez l'extension et connectez-vous
Avantage : Ultra rapide, aucune installation

OPTION 2 : Proxy Node.js (2 minutes) 
1. Dans le dossier du projet :
   npm install
   CTFD_URL=https://votre-ctfd.com npm start
   
2. Ouvrez http://localhost:3000/index.html
Avantage : Pas besoin d'extension, plus sécurisé

OPTION 3 : Serveur Python + Extension
1. python -m http.server 8000
2. Installez une extension CORS
3. Ouvrez http://localhost:8000/index.html
Avantage : Simple si Python déjà installé

OBTENIR UN TOKEN API :
1. Connectez-vous à CTFd
2. Settings → Access Tokens → Create
3. Copiez le token (ctf_xxxxxxxxx)

Conseil : Commencez par l'Option 1 !`;
    
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
            // Recharger les permissions utilisateur avant de charger les données
            await loadUserPermissions();
            await loadDataBasedOnPermissions();
            updateVisualization();
            updateAPIStatus('connected', 'Connecté');
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
    userPermissions = { 
        canViewAllTeams: false, 
        canManageTeams: false, 
        canViewFutureChalls: false, 
        isAdmin: false 
    };
    
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
    d3SystemReady = false; // IMPORTANT: Marquer D3 comme non prêt
    d3InitializationInProgress = false;
    buildChallengeMapInProgress = false; // Reset des flags de construction
    buildChallengeMapCompleted = false;
    
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

// Variable pour éviter les appels multiples
let buildChallengeMapInProgress = false;
let buildChallengeMapCompleted = false;

async function buildChallengeMapFromCTFd(ctfdChallenges) {
    // Protection contre les appels multiples
    if (buildChallengeMapInProgress) {
        debugLog('⚠️ buildChallengeMapFromCTFd déjà en cours, ignorant cet appel');
        return;
    }
    
    if (buildChallengeMapCompleted && Object.keys(challengeMap).length > 0) {
        debugLog('⚠️ buildChallengeMapFromCTFd déjà terminé, ignorant cet appel');
        return;
    }
    
    buildChallengeMapInProgress = true;
    
    // Timeout de sécurité après 30 secondes
    setTimeout(() => {
        if (buildChallengeMapInProgress) {
            debugLog('⚠️ Timeout de sécurité - réinitialisation buildChallengeMapInProgress');
            buildChallengeMapInProgress = false;
        }
    }, 30000);
    
    try {
        // Reconstruire challengeMap à partir des données CTFd
        
        if (!ctfdChallenges || ctfdChallenges.length === 0) {
            debugWarn('Aucun challenge reçu de CTFd, utilisation des données de démo');
            buildChallengeMapInProgress = false;
            return;
        }
        
        debugLog('=== 🏗️  CONSTRUCTION DE LA CARTE DES CHALLENGES ===');
        debugLog(`Nombre de challenges reçus: ${ctfdChallenges.length}`);
        debugLog(`Mode actuel: ${userPermissions.isAdmin ? 'ADMIN' : 'JOUEUR'}`);
        debugLog(`ChallengeMap existant avant construction: ${Object.keys(challengeMap).length} challenges`);
    
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
    
    // Étape 2: Fetch les requirements pour chaque challenge (si admin)
    let requirementPromises;
    
    if (userPermissions.isAdmin) {
        debugLog('=== 🔍 DETAILED DEPENDENCY FETCHING DEBUG (MODE ADMIN) ===');
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
        
        requirementPromises = ctfdChallenges.map(async (challenge) => {
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
            // Handle permission errors more gracefully for non-admin users
            if (error.status === 403) {
                debugLog(`  🔒 ${challenge.name}: Requirements API requires admin permissions (403 Forbidden)`);
                debugLog(`    💡 Mode joueur: Pas d'accès aux dépendances des challenges (normal)`);
                // Ne pas considérer comme une erreur grave pour les joueurs
                challengeMap[challengeId].dependencies = [];
                return { challengeId, requirements: [], source: 'no-permissions' };
            }
            
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
    
    } else {
        // Mode joueur - pas d'accès aux requirements API
        debugLog('=== 👤 MODE JOUEUR: PAS DE CHARGEMENT DES DÉPENDANCES ===');
        debugLog('Les dépendances des challenges ne sont pas accessibles en mode joueur');
        
        // Créer des promesses vides pour chaque challenge
        requirementPromises = ctfdChallenges.map(challenge => {
            const challengeId = String(challenge.id);
            challengeMap[challengeId].dependencies = []; // Pas de dépendances
            return Promise.resolve({ 
                challengeId, 
                requirements: [], 
                source: 'player-mode' 
            });
        });
    }
    
    // Attendre toutes les requêtes de requirements
    debugLog('\n⏳ Waiting for all requirement requests to complete...');
    const allRequirements = await Promise.all(requirementPromises);
    
    // Analyze the results
    debugLog('\n📊 DEPENDENCY FETCHING SUMMARY:');
    const sourceCounts = { api: 0, 'api-converted': 0, fallback: 0, 'player-mode': 0, 'no-permissions': 0 };
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
    
    } catch (error) {
        console.error('❌ Erreur dans buildChallengeMapFromCTFd:', error);
        buildChallengeMapInProgress = false;
        throw error;
    } finally {
        buildChallengeMapInProgress = false;
        buildChallengeMapCompleted = true;
        debugLog('🏁 buildChallengeMapFromCTFd terminé');
    }
}

function selectAllTeams() {
    if (!userPermissions.canManageTeams) return;
    setSelectedTeams(teams.map(t => t.name));
    updateVisualization();
}

function deselectAllTeams() {
    if (!userPermissions.canManageTeams) return;
    setSelectedTeams([]);
    updateVisualization();
}

function selectSingleTeam() {
    if (!userPermissions.canManageTeams) return;
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

// Fonction pour charger la config proxy de façon non-bloquante
async function loadProxyConfig() {
    const urlInput = document.getElementById('ctfd-url');
    
    try {
        debugLog('🔧 Tentative de connexion au proxy local...');
        
        // Timeout court pour éviter l'attente
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 seconde max
        
        // Vérifier que le proxy est actif
        const healthResponse = await fetch('/health', { 
            signal: controller.signal,
            cache: 'no-cache'
        });
        clearTimeout(timeoutId);
        
        const healthData = await healthResponse.json();
        debugLog('✅ Proxy détecté:', healthData);
        
        // Récupérer la configuration
        const configResponse = await fetch('/config');
        const config = await configResponse.json();
        
        // Mettre à jour le champ URL si une URL proxy est configurée
        if (urlInput && config.ctfdUrl && config.ctfdUrl !== 'https://demo.ctfd.io') {
            urlInput.value = config.ctfdUrl;
            debugLog('📡 URL pré-remplie depuis proxy:', config.ctfdUrl);
        }
        
        // Afficher un indicateur que le proxy est actif
        updateAPIStatus('proxy', 'Proxy actif', config.ctfdUrl);
        
    } catch (error) {
        // Ne pas traiter comme une erreur - mode direct disponible
        debugLog('💡 Proxy local non disponible, utilisation du mode direct');
        
        // Assurer que l'URL par défaut est présente
        if (urlInput && !urlInput.value) {
            urlInput.value = 'https://demo.ctfd.io';
        }
        
        // Pas d'erreur affichée - le mode direct fonctionne très bien
        updateAPIStatus('disconnected', 'Mode direct - Extension CORS requise');
    } finally {
        // Assurer que le champ URL est toujours utilisable
        if (urlInput) {
            urlInput.disabled = false;
            if (!urlInput.value) {
                urlInput.value = 'https://demo.ctfd.io';
            }
        }
    }
}

// Initialisation with enhanced error handling
document.addEventListener('DOMContentLoaded', async () => {
    debugLog('🚀 Starting application initialization...');
    
    // Wait for all essential DOM elements to be ready
    await waitForEssentialElements();
    
    // Charger la config proxy en arrière-plan si en mode local (non-bloquant)
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port === '3000') {
        // Lancer en arrière-plan sans attendre
        loadProxyConfig().catch(error => {
            debugLog('⚠️ Chargement proxy échoué en arrière-plan:', error);
        });
    }
    
    // D3.js will be initialized after login when container is visible
    
    // Run startup verification
    runStartupVerification();
    
    // Initialiser la navigation de la carte
    initializeMapNavigation();
    
    // Initialize drag & drop system
    initializeDragAndDrop();
    
    // Charger les filtres d'équipes sauvegardés
    const savedFilters = localStorage.getItem('teamStatusFilters');
    if (savedFilters) {
        try {
            teamStatusFilters = JSON.parse(savedFilters);
        } catch (e) {
            console.error('Erreur chargement filtres:', e);
        }
    }
    
}); // End of initialization

// ===== SIMPLE FILTER MODAL SYSTEM =====

let currentFilters = {
    search: '',
    categories: new Set(),
    minPoints: 0,
    maxPoints: 500,
    statuses: new Set(['solved', 'attempted', 'available', 'locked'])
};

// Show filter modal
function showFilterModal() {
    document.getElementById('filter-modal').style.display = 'flex';
    populateModalCategories();
    updateModalFromFilters();
}

// Hide filter modal
function hideFilterModal() {
    document.getElementById('filter-modal').style.display = 'none';
}

// Populate categories in modal
function populateModalCategories() {
    const container = document.getElementById('modal-categories');
    if (!container || !challengeMap) return;
    
    const categories = new Set();
    Object.values(challengeMap).forEach(challenge => {
        if (challenge.category) {
            categories.add(challenge.category);
        }
    });
    
    const sortedCategories = Array.from(categories).sort();
    container.innerHTML = '';
    
    sortedCategories.forEach(category => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px; cursor: pointer;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = currentFilters.categories.has(category);
        checkbox.value = category;
        checkbox.style.marginRight = '8px';
        
        const text = document.createElement('span');
        text.textContent = category;
        
        label.appendChild(checkbox);
        label.appendChild(text);
        container.appendChild(label);
    });
}

// Update modal inputs from current filters
function updateModalFromFilters() {
    document.getElementById('modal-search').value = currentFilters.search;
    document.getElementById('modal-min-points').value = currentFilters.minPoints;
    document.getElementById('modal-max-points').value = currentFilters.maxPoints;
    
    document.getElementById('modal-solved').checked = currentFilters.statuses.has('solved');
    document.getElementById('modal-attempted').checked = currentFilters.statuses.has('attempted');
    document.getElementById('modal-available').checked = currentFilters.statuses.has('available');
    document.getElementById('modal-locked').checked = currentFilters.statuses.has('locked');
}

// Apply filters from modal
function applyModalFilters() {
    // Get search
    currentFilters.search = document.getElementById('modal-search').value.toLowerCase();
    
    // Get categories
    currentFilters.categories.clear();
    document.querySelectorAll('#modal-categories input[type="checkbox"]:checked').forEach(checkbox => {
        currentFilters.categories.add(checkbox.value);
    });
    
    // Get points range
    currentFilters.minPoints = parseInt(document.getElementById('modal-min-points').value) || 0;
    currentFilters.maxPoints = parseInt(document.getElementById('modal-max-points').value) || 500;
    
    // Get statuses
    currentFilters.statuses.clear();
    if (document.getElementById('modal-solved').checked) currentFilters.statuses.add('solved');
    if (document.getElementById('modal-attempted').checked) currentFilters.statuses.add('attempted');
    if (document.getElementById('modal-available').checked) currentFilters.statuses.add('available');
    if (document.getElementById('modal-locked').checked) currentFilters.statuses.add('locked');
    
    // Apply filters to visualization
    applyChallengeFilters();
    
    // Update active filters display
    updateActiveFiltersDisplay();
    
    // Close modal
    hideFilterModal();
}

// Reset filters in modal
function resetModalFilters() {
    currentFilters = {
        search: '',
        categories: new Set(),
        minPoints: 0,
        maxPoints: 500,
        statuses: new Set(['solved', 'attempted', 'available', 'locked'])
    };
    
    updateModalFromFilters();
    populateModalCategories();
    applyChallengeFilters();
    updateActiveFiltersDisplay();
}

// Apply filters to challenges
function applyChallengeFilters() {
    if (!challengeMap) {
        console.warn('challengeMap not available, skipping filter application');
        return;
    }
    
    let hiddenCount = 0;
    let visibleCount = 0;
    
    Object.entries(challengeMap).forEach(([challengeId, challenge]) => {
        const shouldShow = checkChallengePassesFilters(challenge);
        
        // Apply to legacy nodes
        const legacyNode = document.querySelector(`.challenge-node[data-challenge="${challengeId}"]`);
        if (legacyNode) {
            if (shouldShow) {
                legacyNode.classList.remove('challenge-filtered');
                visibleCount++;
            } else {
                legacyNode.classList.add('challenge-filtered');
                hiddenCount++;
            }
        }
        
        // Apply to D3 nodes - use the data binding instead of DOM selectors
        if (window.d3Data && window.d3Data.nodeGroup) {
            window.d3Data.nodeGroup.selectAll('.d3-challenge-node')
                .filter(d => d.id === challengeId)
                .classed('d3-challenge-filtered', !shouldShow);
        }
    });
    
    debugLog(`Filters applied: ${visibleCount} visible, ${hiddenCount} hidden`);
}

// Check if challenge passes all filters
function checkChallengePassesFilters(challenge) {
    // Search filter
    if (currentFilters.search && !challenge.name.toLowerCase().includes(currentFilters.search)) {
        return false;
    }
    
    // Category filter
    if (currentFilters.categories.size > 0 && !currentFilters.categories.has(challenge.category)) {
        return false;
    }
    
    // Points filter
    const points = challenge.value || challenge.points || 0;
    if (points < currentFilters.minPoints || points > currentFilters.maxPoints) {
        return false;
    }
    
    // Status filter
    const status = getSimpleChallengeStatus(challenge.id);
    if (!currentFilters.statuses.has(status)) {
        return false;
    }
    
    return true;
}

// Get simple challenge status
function getSimpleChallengeStatus(challengeId) {
    const selectedTeamsList = selectedTeams || [];
    if (selectedTeamsList.length === 0) return 'available';
    
    // Safety check for teamProgress
    if (!teamProgress || typeof teamProgress !== 'object') {
        return 'available';
    }
    
    let hasSolved = false;
    let hasAttempted = false;
    
    selectedTeamsList.forEach(teamName => {
        const teamData = teamProgress[teamName];
        if (teamData && teamData[challengeId]) {
            const challengeData = teamData[challengeId];
            if (challengeData.solved || challengeData.status === 'solved') {
                hasSolved = true;
            } else if (challengeData.attempted || challengeData.status === 'attempted') {
                hasAttempted = true;
            }
        }
    });
    
    if (hasSolved) return 'solved';
    if (hasAttempted) return 'attempted';
    return 'available';
}

// Update active filters display
function updateActiveFiltersDisplay() {
    const container = document.getElementById('modal-active-filters');
    const tagsContainer = document.getElementById('modal-filter-tags');
    
    if (!container || !tagsContainer) return;
    
    const activeTags = [];
    
    // Search
    if (currentFilters.search) {
        activeTags.push(`Recherche : "${escapeHtml(currentFilters.search)}"`);
    }

    // Categories
    if (currentFilters.categories.size > 0) {
        currentFilters.categories.forEach(cat => {
            activeTags.push(`${escapeHtml(cat)}`);
        });
    }
    
    // Points
    if (currentFilters.minPoints > 0 || currentFilters.maxPoints < 500) {
        activeTags.push(`${currentFilters.minPoints}–${currentFilters.maxPoints} pts`);
    }
    
    // Statuses
    const allStatuses = ['solved', 'attempted', 'available', 'locked'];
    const missingStatuses = allStatuses.filter(s => !currentFilters.statuses.has(s));
    missingStatuses.forEach(status => {
        const labels = {
            solved: 'Non résolus',
            attempted: 'Non tentés',
            available: 'Non disponibles',
            locked: 'Non verrouillés'
        };
        activeTags.push(labels[status]);
    });
    
    if (activeTags.length > 0) {
        container.style.display = 'block';
        tagsContainer.innerHTML = activeTags.map(tag => 
            `<span style="background: var(--accent-bg); color: var(--accent); padding: 2px 8px; border-radius: 12px; font-size: 12px; margin: 2px; display: inline-block;">${tag}</span>`
        ).join('');
    } else {
        container.style.display = 'none';
    }
}

// Make functions globally available
window.showFilterModal = showFilterModal;
window.hideFilterModal = hideFilterModal;
window.applyModalFilters = applyModalFilters;
window.resetModalFilters = resetModalFilters;