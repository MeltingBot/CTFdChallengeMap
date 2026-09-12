// ==================== D3.JS CHALLENGE VISUALIZATION SYSTEM ====================

/**
 * Professional D3.js-based CTF Challenge Map
 * Provides seamless drag & drop with real-time arrow updates
 * Includes force simulation, zoom/pan, and collision detection
 */

// D3 Visualization Variables
let d3Data = {
    nodes: [],
    links: [],
    simulation: null,
    svg: null,
    zoomContainer: null,
    nodeGroup: null,
    linkGroup: null,
    pathGroup: null, // Group for team paths
    zoom: null,
    width: 0,
    height: 0
};

// D3 Configuration
const D3_CONFIG = {
    nodeWidth: 140,
    nodeHeight: 80,
    statusRadius: 12,
    forceStrength: {
        link: 0.8,           // Force plus forte pour maintenir les liens
        charge: -1200,       // Répulsion plus forte pour éviter le chevauchement
        collision: 160,      // Rayon de collision légèrement augmenté
        center: 0.05,        // Force de centrage réduite pour plus de liberté
        x: 0.1,             // Force horizontale pour aligner
        y: 0.1              // Force verticale pour aligner
    },
    simulation: {
        alpha: 0.5,          // Alpha initial réduit pour moins de rebond
        alphaDecay: 0.02,    // Décroissance plus rapide de l'alpha
        velocityDecay: 0.3   // Friction augmentée pour réduire l'élasticité
    },
    animation: {
        duration: 300,
        easeType: d3.easeCubicOut
    },
    zoom: {
        min: 0.3,
        max: 3.0,
        step: 0.1
    }
};

/**
 * Clear all D3 data and stop simulation
 */
function clearD3Visualization() {
    try {
        
        // Stop simulation
        if (d3Data.simulation) {
            d3Data.simulation.stop();
            d3Data.simulation = null;
        }
        
        // Clear data arrays
        d3Data.nodes = [];
        d3Data.links = [];
        
        // Clear SVG elements
        if (d3Data.svg) {
            d3Data.svg.selectAll('*').remove();
        }
        
        // Reset groups
        d3Data.nodeGroup = null;
        d3Data.linkGroup = null;
        d3Data.pathGroup = null;
        d3Data.zoomContainer = null;
        
    } catch (error) {
        console.error('❌ Error clearing D3 visualization:', error);
    }
}

/**
 * Initialize D3.js visualization system with robust error handling
 */
async function initializeD3Visualization() {
    
    try {
        // Check if D3 is available
        if (typeof d3 === 'undefined') {
            console.error('❌ D3.js library not loaded');
            return false;
        }
        
        // Check container immediately first (fast path)
        let container = checkContainerImmediate('map-container');
        if (!container) {
                // If not ready, wait asynchronously
            container = await waitForContainer('map-container');
            if (!container) {
                console.error('❌ map-container not found or not ready after waiting');
                return false;
            }
        }
        
        d3Data.width = container.clientWidth || 800; // fallback dimensions
        d3Data.height = container.clientHeight || 600;
    
    // Setup SVG
    d3Data.svg = d3.select('#d3-svg')
        .attr('width', d3Data.width)
        .attr('height', d3Data.height);
    
    // Setup zoom container
    d3Data.zoomContainer = d3Data.svg.select('#d3-zoom-container');
    
    // Setup groups (order matters for z-index)
    d3Data.linkGroup = d3Data.zoomContainer.select('#d3-links');
    // Insert path group after links but before nodes
    d3Data.pathGroup = d3Data.zoomContainer.insert('g', '#d3-nodes').attr('id', 'd3-paths');
    d3Data.nodeGroup = d3Data.zoomContainer.select('#d3-nodes');
    
    // Initialize zoom behavior
    setupD3Zoom();
    
    // Initialize force simulation
    setupD3ForceSimulation();
    
        // Setup resize handler
        window.addEventListener('resize', handleD3Resize);
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to initialize D3.js visualization:', error);
        console.warn('D3 visualization failed to initialize, using fallback mode');
        return false;
    }
}

/**
 * Wait for container to be ready with timeout (async version)
 */
async function waitForContainer(containerId, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const container = document.getElementById(containerId);
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
            return container;
        }
        
        // Wait 50ms before checking again (non-blocking)
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.warn(`⚠️ Container '${containerId}' not ready after ${timeout}ms`);
    return null;
}

/**
 * Synchronous container check for immediate validation
 */
function checkContainerImmediate(containerId) {
    const container = document.getElementById(containerId);
    return container && container.clientWidth > 0 && container.clientHeight > 0 ? container : null;
}

/**
 * Notification system removed - using console instead
 */
function showFailsafeNotification(message, type = 'info') {
    // Log to console based on type
    if (type === 'error') {
        console.error(message);
    } else if (type === 'warning') {
        console.warn(message);
    } else {
        console.log(message);
    }
}

/**
 * Setup D3 zoom and pan behavior with error handling
 */
function setupD3Zoom() {
    try {
    d3Data.zoom = d3.zoom()
        .scaleExtent([D3_CONFIG.zoom.min, D3_CONFIG.zoom.max])
        .on('zoom', function(event) {
            // Update zoom container transform
            d3Data.zoomContainer.attr('transform', event.transform);
            
            // Update navigation info
            updateNavigationInfo(event.transform.k, event.transform.x, event.transform.y);
            
            // Sync with legacy zoom system if needed
            currentZoom = event.transform.k;
            currentPan = { x: event.transform.x, y: event.transform.y };
        });
    
    d3Data.svg.call(d3Data.zoom);
    
    // Set initial transform
    const initialTransform = d3.zoomIdentity
        .translate(d3Data.width / 2, d3Data.height / 2)
        .scale(1);
    
        d3Data.svg.call(d3Data.zoom.transform, initialTransform);
    } catch (error) {
        console.error('❌ Failed to setup D3 zoom:', error);
        throw error;
    }
}

/**
 * Setup D3 force simulation for intelligent positioning
 */
function setupD3ForceSimulation() {
    d3Data.simulation = d3.forceSimulation()
        .force('link', d3.forceLink()
            .id(d => d.id)
            .distance(d => {
                // Distance variable selon le type de lien
                const baseDistance = 250;
                return baseDistance;
            })
            .strength(D3_CONFIG.forceStrength.link)
        )
        .force('charge', d3.forceManyBody()
            .strength(d => {
                // Force variable selon le nombre de connexions
                const connections = (d.dependencies ? d.dependencies.length : 0);
                return D3_CONFIG.forceStrength.charge * (1 + connections * 0.2);
            })
        )
        .force('collision', d3.forceCollide()
            .radius(D3_CONFIG.forceStrength.collision)
            .strength(0.9) // Force de collision élevée pour éviter le chevauchement
        )
        .force('center', d3.forceCenter(0, 0)
            .strength(D3_CONFIG.forceStrength.center)
        )
        // Ajout de forces d'alignement pour un rendu plus ordonné
        .force('x', d3.forceX(0).strength(D3_CONFIG.forceStrength.x))
        .force('y', d3.forceY(0).strength(D3_CONFIG.forceStrength.y))
        // Configuration de la simulation pour réduire l'élasticité
        .alpha(D3_CONFIG.simulation.alpha)
        .alphaDecay(D3_CONFIG.simulation.alphaDecay)
        .velocityDecay(D3_CONFIG.simulation.velocityDecay)
        .on('tick', throttle(updateD3Positions, 16)); // ~60fps
    
    // Stop simulation initially
    d3Data.simulation.stop();
}

/**
 * Throttle function for performance optimization
 */
function throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;
    return function (...args) {
        // Protection: ne pas exécuter si D3 a été nettoyé
        if (!d3Data.nodeGroup || !d3Data.simulation) {
            clearTimeout(timeoutId);
            return;
        }
        
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                // Double vérification avant l'exécution différée
                if (!d3Data.nodeGroup || !d3Data.simulation) {
                    return;
                }
                func.apply(this, args);
                lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
        }
    };
}

/**
 * Convert challenge data to D3 format
 */
function convertToD3Data(challengeMap, teamProgress = {}) {
    
    const nodes = [];
    const links = [];
    
    // Create nodes from challenges
    Object.entries(challengeMap).forEach(([id, challenge]) => {
        try {
            const status = getChallengeStatus(id, teamProgress);
            const teamIndicators = getChallengeTeamIndicators(id);
            
            const node = {
                id: id,
                name: challenge.name,
                category: challenge.category || 'General',
                points: challenge.points || 0,
                dependencies: challenge.dependencies || [],
                position: challenge.position || { x: 0, y: 0 },
                status: status,
                teamIndicators: teamIndicators,
                // D3 positioning
                x: challenge.position?.x || Math.random() * 800,
                y: challenge.position?.y || Math.random() * 600,
                fx: window.customPositions && window.customPositions[id]?.x, // Fixed position if manually placed
                fy: window.customPositions && window.customPositions[id]?.y
            };
            
            nodes.push(node);
        } catch (error) {
            console.error(`❌ Erreur lors du traitement du challenge ${id}:`, error);
            console.error(`Challenge data:`, challenge);
        }
    });
    
    // Create links from dependencies
    nodes.forEach(node => {
        node.dependencies.forEach(depId => {
            const sourceNode = nodes.find(n => n.id === String(depId));
            if (sourceNode) {
                links.push({
                    source: sourceNode.id,
                    target: node.id,
                    type: 'dependency'
                });
            }
        });
    });
    
    // Calculate intelligent initial positioning based on dependencies
    calculateInitialLayout(nodes, links);
    
    return { nodes, links };
}

/**
 * Calculate intelligent initial layout based on dependencies
 */
function calculateInitialLayout(nodes, links) {
    // Calculate dependency levels (depth in the graph)
    const levels = new Map();
    const visited = new Set();
    const inDegree = new Map();
    
    // Initialize in-degree count for each node
    nodes.forEach(node => {
        inDegree.set(node.id, 0);
    });
    
    // Count incoming edges for each node
    links.forEach(link => {
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    });
    
    // Find root nodes (no dependencies)
    const queue = [];
    nodes.forEach(node => {
        if (inDegree.get(node.id) === 0) {
            levels.set(node.id, 0);
            queue.push(node.id);
        }
    });
    
    // BFS to assign levels
    let maxLevel = 0;
    while (queue.length > 0) {
        const currentId = queue.shift();
        const currentLevel = levels.get(currentId);
        maxLevel = Math.max(maxLevel, currentLevel);
        
        // Find all nodes that depend on this node
        links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (sourceId === currentId) {
                const newLevel = currentLevel + 1;
                const existingLevel = levels.get(targetId);
                
                if (existingLevel === undefined || newLevel > existingLevel) {
                    levels.set(targetId, newLevel);
                    if (!queue.includes(targetId)) {
                        queue.push(targetId);
                    }
                }
            }
        });
    }
    
    // Group nodes by category for better organization
    const categories = new Map();
    nodes.forEach(node => {
        const cat = node.category || 'General';
        if (!categories.has(cat)) {
            categories.set(cat, []);
        }
        categories.get(cat).push(node);
    });
    
    // Position nodes based on levels and categories
    const levelWidth = 300; // Horizontal spacing between levels
    const nodeSpacing = 120; // Vertical spacing between nodes
    const categorySpacing = 150; // Extra spacing between categories
    
    let categoryOffset = 0;
    Array.from(categories.entries()).forEach(([category, categoryNodes], catIndex) => {
        // Group nodes in this category by level
        const levelGroups = new Map();
        categoryNodes.forEach(node => {
            const level = levels.get(node.id) || 0;
            if (!levelGroups.has(level)) {
                levelGroups.set(level, []);
            }
            levelGroups.get(level).push(node);
        });
        
        // Position nodes within each level of this category
        Array.from(levelGroups.entries()).forEach(([level, levelNodes]) => {
            const x = level * levelWidth - (maxLevel * levelWidth) / 2;
            
            levelNodes.forEach((node, index) => {
                const totalNodesInLevel = levelNodes.length;
                const y = categoryOffset + (index - (totalNodesInLevel - 1) / 2) * nodeSpacing;
                
                // Only set initial position if not manually positioned
                if (!window.customPositions || !window.customPositions[node.id]) {
                    node.x = x + (Math.random() - 0.5) * 50; // Small random offset
                    node.y = y + (Math.random() - 0.5) * 50;
                }
            });
        });
        
        // Calculate category height and update offset
        const categoryHeight = Math.max(
            categoryNodes.length * nodeSpacing,
            100
        );
        categoryOffset += categoryHeight + categorySpacing;
    });
    
    // Handle orphaned nodes (no level assigned)
    nodes.forEach(node => {
        if (!levels.has(node.id) && (!window.customPositions || !window.customPositions[node.id])) {
            node.x = (Math.random() - 0.5) * 400;
            node.y = (Math.random() - 0.5) * 400;
        }
    });
}

/**
 * Check if D3 visualization system is ready
 */
function isD3Ready() {
    // Check D3 library
    if (typeof d3 === 'undefined') {
        console.warn('⚠️ D3.js library not available');
        return false;
    }
    
    // Check essential containers
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
        console.warn('⚠️ map-container element not found');
        return false;
    }
    
    // Check D3 data structures
    if (!d3Data.svg) {
        console.warn('⚠️ D3 SVG not initialized');
        return false;
    }
    
    // Check required challenge data
    if (typeof challengeMap === 'undefined' || !challengeMap) {
        console.warn('⚠️ Challenge map not available');
        return false;
    }
    
    return true;
}

// Protection contre les appels multiples avec timeout
let renderD3InProgress = false;
let renderD3LastCall = 0;
let lastDataHash = null;
window.lastDataHash = null; // Expose globally for forced re-renders

/**
 * Render challenges using D3.js with comprehensive error handling
 */
function renderD3Challenges() {
    const now = Date.now();
    
    if (renderD3InProgress) {
        console.log('⚠️ renderD3Challenges déjà en cours, ignorant cet appel');
        return;
    }
    
    // Protection contre les appels trop rapprochés (moins de 100ms)
    if (now - renderD3LastCall < 100) {
        console.log('⚠️ renderD3Challenges appelé trop rapidement, ignorant cet appel');
        return;
    }
    
    renderD3InProgress = true;
    renderD3LastCall = now;
    
    // Comprehensive readiness check
    if (!isD3Ready()) {
        console.warn('D3 not ready, falling back to legacy rendering');
        renderD3InProgress = false;
        return renderLegacyChallenges();
    }
    
    try {
        
        // Convert data
        const data = convertToD3Data(challengeMap, teamProgress);
        
        // Protection contre selectedTeams mal formé
        const safeSelectedTeamsLength = Array.isArray(selectedTeams) ? selectedTeams.length : 0;
        
        // Vérifier si les données ont changé - Version simple et sûre
        const currentDataHash = `challenges:${Object.keys(challengeMap).length}-teams:${Object.keys(teamProgress).length}-selected:${safeSelectedTeamsLength}`;
        
        // Check both local and global hash, but allow first render after D3 initialization
        if (lastDataHash === currentDataHash && window.lastDataHash === currentDataHash && d3Data.nodes.length > 0) {
            console.log('⚠️ Données identiques et nodes déjà présents, pas de nouveau rendu nécessaire');
            renderD3InProgress = false;
            return;
        }
        
        lastDataHash = currentDataHash;
        window.lastDataHash = currentDataHash; // Sync with global
        
        d3Data.nodes = data.nodes;
        d3Data.links = data.links;
        
        
        // Performance check - warn for large graphs
        if (d3Data.nodes.length > 100) {
            console.warn(`⚠️ Large graph detected: ${d3Data.nodes.length} nodes. Performance may be affected.`);
        }
        
        // Update simulation
        d3Data.simulation.nodes(d3Data.nodes);
        d3Data.simulation.force('link').links(d3Data.links);
        
        // Render links
        renderD3Links();
        
        // Render nodes
        renderD3Nodes();
        
        // Start simulation with adaptive alpha based on graph size and improved stability
        const nodeCount = d3Data.nodes.length;
        let alpha, alphaTarget;
        
        if (nodeCount > 100) {
            alpha = 0.1;
            alphaTarget = 0.01;
        } else if (nodeCount > 50) {
            alpha = 0.2;
            alphaTarget = 0.02;
        } else {
            alpha = 0.3;
            alphaTarget = 0.03;
        }
        
        // Configuration pour stabilisation rapide
        d3Data.simulation
            .alpha(alpha)
            .alphaTarget(alphaTarget)
            .restart();
        
        // Arrêt automatique après un temps raisonnable pour éviter l'animation infinie
        setTimeout(() => {
            if (d3Data.simulation) {
                d3Data.simulation.alphaTarget(0);
            }
        }, 3000); // 3 secondes max

        // En mode Parcours, dessiner les tracés une fois le rendu posé,
        // même si la simulation ne produit aucun tick.
        if (window.parcoursMode && window.refreshTeamPaths) {
            setTimeout(() => window.refreshTeamPaths(), 60);
        }

    } catch (error) {
        console.error('❌ Error rendering D3 challenges:', error);
        console.error('Error rendering visualization, falling back to legacy mode');
        renderLegacyChallenges();
    } finally {
        // Délai pour éviter les appels trop rapprochés
        setTimeout(() => {
            renderD3InProgress = false;
        }, 50);
    }
}

/**
 * Render D3 links (arrows between challenges)
 */
function renderD3Links() {
    const links = d3Data.linkGroup.selectAll('.d3-link')
        .data(d3Data.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
    
    // Remove old links
    links.exit().remove();
    
    // Add new links
    const linkEnter = links.enter()
        .append('path')
        .attr('class', 'd3-link')
        .attr('stroke', '#5c6673')
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('opacity', 0.7)
        .attr('marker-end', 'url(#arrowhead)');
    
    // Update all links
    linkEnter.merge(links)
        .transition()
        .duration(D3_CONFIG.animation.duration)
        .attr('opacity', 0.7);
}

/**
 * Render D3 nodes (challenge boxes)
 */
function renderD3Nodes() {
    // Vérifier les doublons dans les données (diagnostic)
    const ids = d3Data.nodes.map(n => n.id);
    const uniqueIds = [...new Set(ids)];
    if (ids.length !== uniqueIds.length) {
        console.error('❌ DOUBLONS détectés dans d3Data.nodes!');
        console.error('IDs dupliqués:', ids.filter((id, index) => ids.indexOf(id) !== index));
    }
    
    const nodes = d3Data.nodeGroup.selectAll('.d3-challenge-node')
        .data(d3Data.nodes, d => d.id);
    
    
    // Remove old nodes
    nodes.exit().remove();
    
    // Create new node groups
    const nodeEnter = nodes.enter()
        .append('g')
        .attr('class', 'd3-challenge-node')
        .call(setupD3Drag())
        .on('mouseover', showD3Tooltip)
        .on('mouseout', hideD3Tooltip)
        .on('click', handleD3NodeClick);
    
    // Add challenge rectangle
    nodeEnter.append('rect')
        .attr('class', 'd3-challenge-rect')
        .attr('width', D3_CONFIG.nodeWidth)
        .attr('height', D3_CONFIG.nodeHeight)
        .attr('x', -D3_CONFIG.nodeWidth / 2)
        .attr('y', -D3_CONFIG.nodeHeight / 2);
    
    // Add challenge name
    nodeEnter.append('text')
        .attr('class', 'd3-challenge-text d3-challenge-name')
        .attr('text-anchor', 'middle')
        .attr('y', -10)
        .text(d => truncateText(d.name, 18));
    
    // Add challenge category
    nodeEnter.append('text')
        .attr('class', 'd3-challenge-text d3-challenge-category')
        .attr('text-anchor', 'middle')
        .attr('y', 5)
        .text(d => truncateText(d.category || 'General', 16));
    
    // Add challenge points
    nodeEnter.append('text')
        .attr('class', 'd3-challenge-text d3-challenge-points')
        .attr('text-anchor', 'middle')
        .attr('y', 20)
        .text(d => `${d.points} pts`);
    
    // Add status indicator
    nodeEnter.append('circle')
        .attr('class', 'd3-challenge-status')
        .attr('r', D3_CONFIG.statusRadius)
        .attr('cx', D3_CONFIG.nodeWidth / 2 - 12)
        .attr('cy', -D3_CONFIG.nodeHeight / 2 + 12);
    
    // Add status icon
    nodeEnter.append('text')
        .attr('class', 'd3-challenge-text')
        .attr('text-anchor', 'middle')
        .attr('x', D3_CONFIG.nodeWidth / 2 - 12)
        .attr('y', -D3_CONFIG.nodeHeight / 2 + 16)
        .style('fill', '#12161c')
        .style('font-weight', 'bold')
        .style('font-size', '12px')
        .text(d => getStatusIcon(d.status));
    
    // Update all nodes (new and existing)
    const nodeUpdate = nodeEnter.merge(nodes);
    
    // Update data for existing nodes
    nodeUpdate.each(function(d) {
        const newData = d3Data.nodes.find(n => n.id === d.id);
        if (newData) {
            d.status = newData.status;
            d.teamIndicators = newData.teamIndicators;
        }
    });
    
    // Update styles based on challenge status
    updateD3NodeStyles(nodeUpdate);
    
    // Update team indicators
    updateD3TeamIndicators(nodeUpdate);
    
    // Update status icon text
    nodeUpdate.select('.d3-challenge-text:last-of-type')
        .text(d => getStatusIcon(d.status));
    
}

/**
 * Setup D3 drag behavior
 */
function setupD3Drag() {
    return d3.drag()
        .on('start', function(event, d) {
            // Réduction de l'alphaTarget pour moins de rebond
            if (!event.active) d3Data.simulation.alphaTarget(0.1).restart();
            
            // Add dragging visual feedback
            d3.select(this).classed('dragging', true);
            
            // Fix the node position
            d.fx = d.x;
            d.fy = d.y;
            
            // Store original position
            d._originalFx = d.fx;
            d._originalFy = d.fy;
            
        })
        .on('drag', function(event, d) {
            // Update node position directement sans redémarrer la simulation
            d.fx = event.x;
            d.fy = event.y;
            
            // Mise à jour douce sans restart pour éviter l'élasticité
            if (d3Data.simulation.alpha() < 0.1) {
                d3Data.simulation.alpha(0.05);
            }
            
            // Update team paths in real-time if parcours mode is active
            if (window.parcoursMode && window.refreshTeamPaths) {
                window.refreshTeamPaths();
            }
        })
        .on('end', function(event, d) {
            // Arrêt plus rapide de la simulation
            if (!event.active) d3Data.simulation.alphaTarget(0);
            
            // Remove dragging visual feedback
            d3.select(this).classed('dragging', false);
            
            // Stabilisation immédiate
            d3Data.simulation.alpha(0.02);
            
            // Save custom position
            if (window.customPositions) {
                window.customPositions[d.id] = { x: d.fx, y: d.fy };
            }
            challengeMap[d.id].position = { x: d.fx, y: d.fy };
            
            // Save to session storage
            saveCustomPositions();
            
            // Update team paths if parcours mode is active
            if (window.parcoursMode && window.updateTeamPaths) {
                setTimeout(() => window.refreshTeamPaths(), 50);
            }
        });
}

/**
 * Update D3 positions during simulation tick
 */
function updateD3Positions() {
    // Protection: vérifier que D3 est toujours initialisé
    if (!d3Data.nodeGroup || !d3Data.linkGroup) {
        return;
    }
    
    // Update node positions
    d3Data.nodeGroup.selectAll('.d3-challenge-node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
    
    // Update team paths if parcours mode is active.
    // Pendant la stabilisation on redessine de façon throttlée pour que les
    // flèches suivent les nœuds (sinon elles pointent dans le vide au début).
    if (window.parcoursMode && window.refreshTeamPaths) {
        const now = performance.now();
        const settled = d3Data.simulation.alpha() < 0.01;
        if (settled || now - (d3Data.lastPathRefresh || 0) > 120) {
            d3Data.lastPathRefresh = now;
            window.refreshTeamPaths();
        }
    }
    
    // Update link paths with curved arrows
    d3Data.linkGroup.selectAll('.d3-link')
        .attr('d', function(d) {
            const source = d.source;
            const target = d.target;
            
            // Calculate edge points (from node edges, not centers)
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance === 0) return '';
            
            // Calculate connection points on node edges
            const sourceX = source.x + (dx / distance) * (D3_CONFIG.nodeWidth / 2);
            const sourceY = source.y + (dy / distance) * (D3_CONFIG.nodeHeight / 2);
            const targetX = target.x - (dx / distance) * (D3_CONFIG.nodeWidth / 2 + 15); // Extra space for arrow
            const targetY = target.y - (dy / distance) * (D3_CONFIG.nodeHeight / 2 + 15);
            
            // Create curved path
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            
            // Add curve control point
            const perpX = -(targetY - sourceY) * 0.1;
            const perpY = (targetX - sourceX) * 0.1;
            
            return `M ${sourceX} ${sourceY} Q ${midX + perpX} ${midY + perpY} ${targetX} ${targetY}`;
        });
}

/**
 * Update D3 node styles based on challenge status
 */
function updateD3NodeStyles(nodes) {
    nodes.select('.d3-challenge-rect')
        .attr('fill', d => getChallengeColor(d.status, d.id).background)
        .attr('stroke', d => getChallengeColor(d.status, d.id).border);
    
    nodes.select('.d3-challenge-status')
        .attr('fill', d => getChallengeColor(d.status, d.id).status);
}

/**
 * Update D3 team indicators
 */
function updateD3TeamIndicators(nodes) {
    // Remove existing team indicators
    nodes.selectAll('.d3-team-indicator').remove();
    
    // Add team indicators for nodes that have them
    const nodesWithTeams = nodes.filter(d => d.teamIndicators && d.teamIndicators.length > 0);
    
    if (nodesWithTeams.size() === 0) return;
    
    const teamGroups = nodesWithTeams.append('g')
        .attr('class', 'd3-team-indicator')
        .attr('transform', `translate(0, ${D3_CONFIG.nodeHeight / 2 + 15})`);
    
    // Add background
    teamGroups.append('rect')
        .attr('class', 'd3-team-indicator-bg')
        .attr('width', d => Math.max(60, d.teamIndicators.length * 12 + 16))
        .attr('height', 20)
        .attr('x', d => -Math.max(30, d.teamIndicators.length * 6 + 8))
        .attr('y', -10);
    
    // Add team dots
    teamGroups.each(function(d) {
        const group = d3.select(this);
        const startX = -d.teamIndicators.length * 6 + 6;
        
        d.teamIndicators.forEach((team, i) => {
            group.append('circle')
                .attr('r', 4)
                .attr('cx', startX + i * 12)
                .attr('cy', 0)
                .attr('fill', team.color)
                .attr('stroke', '#191f27')
                .attr('stroke-width', 1);
        });
    });
}

/**
 * Handle D3 tooltip display
 */
function showD3Tooltip(event, d) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    let content = `<strong>${d.name}</strong><br>`;
    content += `Category: ${d.category}<br>`;
    content += `Points: ${d.points}<br>`;
    content += `Status: ${getStatusText(d.status)}<br>`;
    
    // Add heatmap information if in heatmap mode
    if (window.heatmapMode && window.getChallengeHeatmapColors) {
        const heatmapData = window.getChallengeHeatmapColors();
        if (heatmapData[d.id]) {
            const data = heatmapData[d.id];
            content += `<br><strong>Temps de résolution:</strong><br>`;
            content += `• Temps moyen: ${data.timeFormatted}<br>`;
            content += `• Équipes: ${data.solveCount}/${window.selectedTeams.length}<br>`;
            content += `• Difficulté: ${Math.round(data.normalizedTime * 100)}%<br>`;
        } else {
            // Challenge not solved by selected teams
            content += `<br><strong>Heatmap:</strong><br>`;
            content += `• Non résolu par les équipes sélectionnées<br>`;
            content += `• Aucune donnée de temps disponible<br>`;
        }
    }
    
    if (d.dependencies.length > 0) {
        content += `<br><strong>Dependencies:</strong><br>`;
        d.dependencies.forEach(depId => {
            const dep = challengeMap[depId];
            if (dep) {
                content += `• ${dep.name}<br>`;
            }
        });
    }
    
    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
}

/**
 * Hide D3 tooltip
 */
function hideD3Tooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Handle D3 node clicks
 */
function handleD3NodeClick(event, d) {
    // Prevent event bubbling
    event.stopPropagation();
    
    // Show challenge solves modal
    if (window.showChallengeSolvesModal) {
        window.showChallengeSolvesModal(d.id);
    }
}

/**
 * Handle D3 resize
 */
function handleD3Resize() {
    const container = document.getElementById('map-container');
    d3Data.width = container.clientWidth;
    d3Data.height = container.clientHeight;
    
    d3Data.svg
        .attr('width', d3Data.width)
        .attr('height', d3Data.height);
    
    // Update force center
    d3Data.simulation.force('center', d3.forceCenter(0, 0));
}

/**
 * D3 Zoom Controls
 */
function zoomInD3() {
    d3Data.svg.transition().call(
        d3Data.zoom.scaleBy, 1 + D3_CONFIG.zoom.step
    );
}

function zoomOutD3() {
    d3Data.svg.transition().call(
        d3Data.zoom.scaleBy, 1 - D3_CONFIG.zoom.step
    );
}

function resetViewD3() {
    const initialTransform = d3.zoomIdentity
        .translate(d3Data.width / 2, d3Data.height / 2)
        .scale(1);
    
    d3Data.svg.transition().call(d3Data.zoom.transform, initialTransform);
}

function fitToScreenD3() {
    if (d3Data.nodes.length === 0) return;
    
    // Calculate bounding box of all nodes
    const bounds = {
        minX: d3.min(d3Data.nodes, d => d.x - D3_CONFIG.nodeWidth / 2),
        maxX: d3.max(d3Data.nodes, d => d.x + D3_CONFIG.nodeWidth / 2),
        minY: d3.min(d3Data.nodes, d => d.y - D3_CONFIG.nodeHeight / 2),
        maxY: d3.max(d3Data.nodes, d => d.y + D3_CONFIG.nodeHeight / 2)
    };
    
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Calculate scale to fit with padding
    const padding = 50;
    const scale = Math.min(
        (d3Data.width - padding * 2) / width,
        (d3Data.height - padding * 2) / height,
        D3_CONFIG.zoom.max
    );
    
    const transform = d3.zoomIdentity
        .translate(d3Data.width / 2, d3Data.height / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
    
    d3Data.svg.transition().call(d3Data.zoom.transform, transform);
}

/**
 * Utility functions for D3 visualization
 */
function getChallengeStatus(challengeId, teamProgress) {
    // Determine challenge status based on team progress
    if (!userPermissions.canViewAllTeams) {
        // Single team view - use the same logic as getChallengeOverallState
        const teamName = currentUser.teamName;
        const progress = teamProgress[teamName] && teamProgress[teamName][challengeId];
        
        if (!progress) return 'hidden';
        if (progress.solved) return 'solved';
        if (progress.attempted) return 'attempted';
        if (progress.locked) return 'locked';
        return 'available';
    } else {
        // Multi-team view  
        if (!selectedTeams || selectedTeams.length === 0) {
            // Pas d'équipes sélectionnées : afficher tous les challenges comme disponibles
            return 'available';
        }
        
        const hasAnyResolved = selectedTeams.some(team => 
            teamProgress[team] && teamProgress[team][challengeId] && teamProgress[team][challengeId].solved
        );
        if (hasAnyResolved) return 'solved';
        
        const hasAnyAttempted = selectedTeams.some(team => 
            teamProgress[team] && teamProgress[team][challengeId] && teamProgress[team][challengeId].attempted
        );
        if (hasAnyAttempted) return 'attempted';
        
        const hasAnyAvailable = selectedTeams.some(team => {
            const progress = teamProgress[team] && teamProgress[team][challengeId];
            return progress && !progress.locked;
        });
        return hasAnyAvailable ? 'available' : 'locked';
    }
}

function getChallengeTeamIndicators(challengeId) {
    if (!userPermissions.canViewAllTeams || selectedTeams.length <= 1) {
        return [];
    }
    
    return selectedTeams.map(teamName => {
        const team = teams.find(t => t.name === teamName);
        let solved = false;
        
        if (teamProgress[teamName] && teamProgress[teamName][challengeId]) {
            const progress = teamProgress[teamName][challengeId];
            solved = progress.solved === true || progress.status === 'solved';
        }
        
        return {
            team: teamName,
            color: team ? team.color : '#8b96a5',
            solved: solved
        };
    }).filter(indicator => indicator.solved);
}

function getChallengeColor(status, challengeId = null) {
    // Check if heatmap mode is active
    if (window.heatmapMode && challengeId && window.getChallengeHeatmapColors) {
        const heatmapData = window.getChallengeHeatmapColors();
        if (heatmapData[challengeId]) {
            const heatColor = heatmapData[challengeId].color;
            return {
                background: heatColor,
                border: heatColor,
                status: '#12161c'
            };
        } else {
            // Challenge not solved/attempted by selected teams - show in gray
            return {
                background: '#191f27',
                border: '#4a5561',
                status: '#5c6673'
            };
        }
    }
    
    // Default status-based colors
    const colors = {
        solved: {
            background: 'url(#gradient-solved)',
            border: '#57ab7c',
            status: '#57ab7c'
        },
        attempted: {
            background: 'url(#gradient-attempted)',
            border: '#c99a4b',
            status: '#c99a4b'
        },
        available: {
            background: 'url(#gradient-available)',
            border: '#7aa5d2',
            status: '#7aa5d2'
        },
        locked: {
            background: 'url(#gradient-locked)',
            border: '#4a5561',
            status: '#4a5561'
        },
        hidden: {
            background: '#191f27',
            border: '#2e3947',
            status: '#2e3947'
        }
    };
    
    return colors[status] || colors.available;
}

function getStatusIcon(status) {
    const icons = {
        solved: '✓',
        attempted: '!',
        available: '●',
        locked: '⊘',
        hidden: ''
    };
    return icons[status] || '●';
}

function getStatusText(status) {
    const texts = {
        solved: 'Solved',
        attempted: 'Attempted',
        available: 'Available',
        locked: 'Locked'
    };
    return texts[status] || 'Unknown';
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function updateNavigationInfo(scale, x, y) {
    const zoomLevel = document.getElementById('zoom-level');
    const panPosition = document.getElementById('pan-position');
    
    if (zoomLevel) {
        zoomLevel.textContent = Math.round(scale * 100) + '%';
    }
    
    if (panPosition) {
        panPosition.textContent = `${Math.round(x)}, ${Math.round(y)}`;
    }
}

/**
 * Integration with legacy system
 */
function renderLegacyChallenges() {
    // Fallback to original rendering system if D3 is not available
    console.warn('Using legacy challenge rendering');
    // Original rendering code would go here
}

/**
 * Missing utility functions that need to be available globally
 */
function getTeamProgress(teamName, challengeId) {
    // Get team progress from global teamProgress object
    if (!teamProgress[teamName]) return { solved: false, attempted: false };
    
    const progress = teamProgress[teamName][challengeId];
    if (!progress) return { solved: false, attempted: false };
    
    return {
        solved: progress.solved || false,
        attempted: progress.attempted || false,
        solveTime: progress.solveTime
    };
}

function getTeamColor(teamName) {
    // Find team color from teams array
    const team = teams.find(t => t.name === teamName);
    return team ? team.color : '#64748b';
}

function showChallengeDetails(challengeId) {
    // Show challenge details modal/tooltip
    const challenge = challengeMap[challengeId];
    if (!challenge) return;
    
    // This would normally show a detailed modal
}

/**
 * Team selection integration
 */
function onTeamSelectionChange() {
    // Refresh D3 visualization when team selection changes
    if (window.renderD3Challenges && d3Data.svg) {
        renderD3Challenges();
    }
}

// Global error handler for D3 operations
function safeD3Operation(operation, operationName = 'D3 operation') {
    return function(...args) {
        try {
            return operation.apply(this, args);
        } catch (error) {
            console.error(`❌ Safe D3 operation failed (${operationName}):`, error);
            console.warn(`D3 ${operationName} failed, using fallback`);
            return false;
        }
    };
}

/**
 * Calculate connection point on rectangle edge
 */
function getEdgePoint(source, target, nodeWidth, nodeHeight) {
    const sx = source.fx !== undefined ? source.fx : source.x;
    const sy = source.fy !== undefined ? source.fy : source.y;
    const tx = target.fx !== undefined ? target.fx : target.x;
    const ty = target.fy !== undefined ? target.fy : target.y;
    
    // Vector from source to target
    const dx = tx - sx;
    const dy = ty - sy;
    const angle = Math.atan2(dy, dx);
    
    // Calculate edge points
    const sourceEdge = getRectangleEdgePoint(sx, sy, nodeWidth, nodeHeight, angle);
    const targetEdge = getRectangleEdgePoint(tx, ty, nodeWidth, nodeHeight, angle + Math.PI);
    
    return { source: sourceEdge, target: targetEdge };
}

function getRectangleEdgePoint(cx, cy, width, height, angle) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Normalize angle
    while (angle < 0) angle += 2 * Math.PI;
    while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
    
    // Calculate intersection with rectangle
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    let x, y;
    if (Math.abs(cos) * halfHeight > Math.abs(sin) * halfWidth) {
        // Intersects left or right edge
        x = cos > 0 ? halfWidth : -halfWidth;
        y = x * Math.tan(angle);
    } else {
        // Intersects top or bottom edge
        y = sin > 0 ? halfHeight : -halfHeight;
        x = y / Math.tan(angle);
    }
    
    return { x: cx + x, y: cy + y };
}

/**
 * Animation state for progressive path drawing
 */
let pathAnimationState = {
    isPlaying: false,
    speed: 1000, // ms between steps
    currentStep: 0,
    totalSteps: 0,
    animationId: null,
    teamSolveSequences: {}, // Store solve sequences for each team
    speedMultiplier: 1, // Current speed multiplier
    isPaused: false, // Animation en pause (session toujours active)
    sessionActive: false, // Une session d'animation est en cours (même en pause ou terminée)
    startTime: null, // Competition start time (first solve)
    endTime: null, // Competition end time (last solve)
    currentVirtualTime: null, // Current virtual time being displayed
    allEvents: [] // All solve events sorted by date
};

/**
 * Calculate solve sequences for all selected teams
 */
function calculateTeamSolveSequences() {
    const sequences = {};
    
    window.selectedTeams.forEach(teamName => {
        const solvedChallenges = [];
        if (window.teamProgress[teamName]) {
            Object.entries(window.teamProgress[teamName]).forEach(([challengeId, progress]) => {
                if ((progress.solved === true || progress.status === 'solved') && progress.date) {
                    const node = d3Data.nodes.find(n => n.id === challengeId);
                    if (node) {
                        solvedChallenges.push({
                            id: challengeId,
                            date: new Date(progress.date),
                            node: node,
                            teamName: teamName
                        });
                    }
                }
            });
        }
        
        // Sort by solve date
        solvedChallenges.sort((a, b) => a.date - b.date);
        sequences[teamName] = solvedChallenges;
    });
    
    return sequences;
}

/**
 * Update team paths based on parcours mode
 */
function updateTeamPaths() {
    
    if (!d3Data.pathGroup) {
        console.warn('❌ No pathGroup found');
        return;
    }
    
    // Clear existing paths and stop any running animation
    d3Data.pathGroup.selectAll('*').remove();
    stopPathAnimation();
    
    if (!window.parcoursMode || !window.selectedTeams || window.selectedTeams.length === 0) {
        return;
    }
    
    
    // Calculate solve sequences for animation
    pathAnimationState.teamSolveSequences = calculateTeamSolveSequences();
    
    // Use static mode by default
    updateTeamPathsStatic();
}

/**
 * Start progressive path animation
 */
function startPathAnimation() {
    if (pathAnimationState.isPlaying) {
        stopPathAnimation();
    }
    
    
    // Reset animation state
    pathAnimationState.currentStep = 0;
    pathAnimationState.isPlaying = true;
    pathAnimationState.isPaused = false;
    pathAnimationState.sessionActive = true;
    pathAnimationState.startTime = Date.now();
    
    // Calculate all solve events (recompute sequences so the session is self-contained)
    pathAnimationState.teamSolveSequences = calculateTeamSolveSequences();
    pathAnimationState.allEvents = calculateAllSolveEvents();
    
    // Initialize timeline
    if (pathAnimationState.allEvents.length > 0) {
        pathAnimationState.startTime = pathAnimationState.allEvents[0].date;
        pathAnimationState.endTime = pathAnimationState.allEvents[pathAnimationState.allEvents.length - 1].date;
        pathAnimationState.currentVirtualTime = pathAnimationState.startTime;
        initializeTimeline();
        showTimeline();
    }
    
    // Clear existing paths
    d3Data.pathGroup.selectAll('*').remove();
    
    // Setup markers for all teams
    setupTeamMarkers();
    
    // Show animation controls
    showAnimationControls();
    
    // Start the animation loop
    updateAnimateButton('Arrêter');
    updatePauseButton();
    animateNextStep();
}

/**
 * Stop path animation
 */
function stopPathAnimation() {
    if (pathAnimationState.animationId) {
        clearTimeout(pathAnimationState.animationId);
        pathAnimationState.animationId = null;
    }
    pathAnimationState.isPlaying = false;
    pathAnimationState.isPaused = false;
    pathAnimationState.sessionActive = false;
    pathAnimationState.currentStep = 0;
    updateAnimateButton('Animer');
    updatePauseButton();
    hideTimeline();
    hideAnimationControls();
}

/**
 * Setup markers for all teams
 */
function setupTeamMarkers() {
    let defs = d3Data.svg.select('defs');
    if (defs.empty()) {
        defs = d3Data.svg.append('defs');
    }
    
    
    window.selectedTeams.forEach((teamName, teamIndex) => {
        const team = window.teams.find(t => t.name === teamName);
        if (!team) return;
        
        const teamColor = team.color || `hsl(${teamIndex * 360 / window.selectedTeams.length}, 70%, 50%)`;
        
        // Create arrowhead marker for this team
        const markerId = `arrow-${teamName.replace(/\s+/g, '-')}`;
        
        defs.select(`#${markerId}`).remove(); // Remove if exists
        
        const marker = defs.append('marker')
            .attr('id', markerId)
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 8)
            .attr('refY', 5)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .attr('markerUnits', 'strokeWidth');
            
        marker.append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', teamColor)
            .attr('opacity', 0.8);
            
    });
}

/**
 * Animate next step in the progression
 */
function animateNextStep() {
    if (!pathAnimationState.isPlaying || pathAnimationState.isPaused) return;
    
    const allSolveEvents = pathAnimationState.allEvents;
    
    if (pathAnimationState.currentStep >= allSolveEvents.length) {
        // Animation complete — session en pause, prête à être rejouée
        pathAnimationState.isPlaying = false;
        pathAnimationState.isPaused = true;
        updatePauseButton();
        const lastEvent = allSolveEvents[allSolveEvents.length - 1];
        const endTime = pathAnimationState.endTime;
        const startTime = pathAnimationState.startTime;
        const totalDuration = endTime - startTime;
        
        // Show final timeline state
        document.getElementById('timeline-current-time').textContent = formatCumulativeDuration(totalDuration);
        document.getElementById('timeline-fill').style.width = '100%';
        return;
    }
    
    // Get current event
    const currentEvent = allSolveEvents[pathAnimationState.currentStep];
    const team = window.teams.find(t => t.name === currentEvent.teamName);
    const teamIndex = window.selectedTeams.indexOf(currentEvent.teamName);
    const teamColor = team ? team.color : `hsl(${teamIndex * 360 / window.selectedTeams.length}, 70%, 50%)`;
    
    
    // Update timeline with current event
    updateTimeline(currentEvent, pathAnimationState.currentStep + 1, allSolveEvents.length);
    
    // Draw this path segment
    drawAnimatedPath(currentEvent, teamColor, teamIndex);
    
    // Schedule next step
    pathAnimationState.currentStep++;
    pathAnimationState.animationId = setTimeout(() => {
        animateNextStep();
    }, pathAnimationState.speed / pathAnimationState.speedMultiplier);
}

/**
 * Compute the bezier geometry of a path segment between two solves.
 */
function computeSegmentGeometry(event, teamIndex) {
    const offset = (teamIndex - (window.selectedTeams.length - 1) / 2) * 20;
    const edges = getEdgePoint(event.fromSolve.node, event.toSolve.node, D3_CONFIG.nodeWidth, D3_CONFIG.nodeHeight);
    const sx = edges.source.x, sy = edges.source.y;
    const tx = edges.target.x, ty = edges.target.y;
    const dx = tx - sx, dy = ty - sy;
    const dr = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (sx + tx) / 2 + (-dy / dr) * offset;
    const my = (sy + ty) / 2 + (dx / dr) * offset;
    return { sx, sy, mx, my, tx, ty, pathString: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}` };
}

/**
 * Draw a segment instantly (no transition) — used when rebuilding to a step.
 */
function drawSegmentInstant(event) {
    const team = window.teams.find(t => t.name === event.teamName);
    const teamIndex = window.selectedTeams.indexOf(event.teamName);
    const teamColor = team ? team.color : `hsl(${teamIndex * 360 / window.selectedTeams.length}, 70%, 50%)`;
    const markerId = `arrow-${event.teamName.replace(/\s+/g, '-')}`;
    const g = computeSegmentGeometry(event, teamIndex);

    d3Data.pathGroup.append('path')
        .attr('class', `team-path-glow team-path-glow-${teamIndex}`)
        .attr('stroke', teamColor)
        .attr('stroke-width', 8)
        .attr('fill', 'none')
        .attr('opacity', 0.3)
        .attr('filter', 'blur(4px)')
        .attr('d', g.pathString);

    d3Data.pathGroup.append('path')
        .attr('class', `team-path team-path-${teamIndex}`)
        .attr('stroke', teamColor)
        .attr('stroke-width', 4)
        .attr('fill', 'none')
        .attr('opacity', 0.9)
        .attr('stroke-linecap', 'round')
        .attr('marker-end', `url(#${markerId})`)
        .attr('d', g.pathString);

    drawPathTimeLabel(g.sx, g.sy, g.mx, g.my, g.tx, g.ty,
        event.toSolve.date - event.fromSolve.date, teamColor);
}

/**
 * Redraw all segments up to the current step (after a drag or a manual step).
 */
function rebuildAnimationToStep() {
    if (!d3Data.pathGroup) return;
    d3Data.pathGroup.selectAll('*').remove();
    setupTeamMarkers();
    const events = pathAnimationState.allEvents;
    const upTo = Math.min(pathAnimationState.currentStep, events.length);
    for (let i = 0; i < upTo; i++) {
        drawSegmentInstant(events[i]);
    }
    if (upTo > 0) {
        updateTimeline(events[upTo - 1], upTo, events.length);
    } else {
        initializeTimeline();
    }
}

/**
 * Pause / resume the running animation.
 */
function togglePlayPause() {
    if (!pathAnimationState.sessionActive) {
        startPathAnimation();
        updateAnimateButton('Arrêter');
        updatePauseButton();
        return;
    }
    if (pathAnimationState.isPaused || !pathAnimationState.isPlaying) {
        pathAnimationState.isPaused = false;
        pathAnimationState.isPlaying = true;
        if (pathAnimationState.currentStep >= pathAnimationState.allEvents.length) {
            pathAnimationState.currentStep = 0;
            rebuildAnimationToStep();
        }
        animateNextStep();
    } else {
        pathAnimationState.isPaused = true;
        if (pathAnimationState.animationId) {
            clearTimeout(pathAnimationState.animationId);
            pathAnimationState.animationId = null;
        }
    }
    updatePauseButton();
}

/**
 * Step the animation backward/forward by one solve.
 */
function stepAnimation(delta) {
    if (!pathAnimationState.sessionActive) {
        // Démarrer une session en pause pour permettre le pas-à-pas
        startPathAnimation();
        updateAnimateButton('Arrêter');
        pathAnimationState.isPaused = true;
        if (pathAnimationState.animationId) {
            clearTimeout(pathAnimationState.animationId);
            pathAnimationState.animationId = null;
        }
        pathAnimationState.currentStep = 0;
        d3Data.pathGroup.selectAll('*').remove();
        setupTeamMarkers();
    } else if (!pathAnimationState.isPaused) {
        pathAnimationState.isPaused = true;
        if (pathAnimationState.animationId) {
            clearTimeout(pathAnimationState.animationId);
            pathAnimationState.animationId = null;
        }
    }
    const max = pathAnimationState.allEvents.length;
    pathAnimationState.currentStep = Math.max(0, Math.min(max, pathAnimationState.currentStep + delta));
    rebuildAnimationToStep();
    updatePauseButton();
}

/**
 * Refresh team paths without killing a running animation session
 * (called during node drags in parcours mode).
 */
function refreshTeamPaths() {
    if (pathAnimationState.sessionActive) {
        rebuildAnimationToStep();
    } else {
        updateTeamPaths();
    }
}

const D3_ICON_PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const D3_ICON_STOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
const D3_ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>';

function updatePauseButton() {
    const btn = document.getElementById('anim-pause-btn');
    if (!btn) return;
    const running = pathAnimationState.sessionActive
        && pathAnimationState.isPlaying
        && !pathAnimationState.isPaused;
    btn.innerHTML = running ? D3_ICON_PAUSE : D3_ICON_PLAY;
    btn.title = running ? 'Pause' : 'Lecture';
}

/**
 * Draw a time label at the midpoint of a quadratic bezier path segment.
 * Shows the elapsed time between the two solves of the segment.
 */
function drawPathTimeLabel(sx, sy, mx, my, tx, ty, elapsedMs, teamColor) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
    if (typeof formatTimeDiff !== 'function') return null;

    // Point on the quadratic bezier at t=0.5
    const lx = sx / 4 + mx / 2 + tx / 4;
    const ly = sy / 4 + my / 2 + ty / 4;

    const labelGroup = d3Data.pathGroup.append('g')
        .attr('class', 'path-time-label')
        .attr('transform', `translate(${lx}, ${ly})`);

    const text = labelGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', "ui-monospace, 'Cascadia Code', Consolas, monospace")
        .attr('fill', teamColor)
        .text(formatTimeDiff(elapsedMs));

    // Background pill sized to the text
    const bbox = text.node().getBBox();
    labelGroup.insert('rect', 'text')
        .attr('x', bbox.x - 5)
        .attr('y', bbox.y - 2)
        .attr('width', bbox.width + 10)
        .attr('height', bbox.height + 4)
        .attr('rx', (bbox.height + 4) / 2)
        .attr('fill', 'rgba(25, 31, 39, 0.92)')
        .attr('stroke', teamColor)
        .attr('stroke-width', 1);

    return labelGroup;
}

/**
 * Draw a single animated path segment
 */
function drawAnimatedPath(event, teamColor, teamIndex) {
    const markerId = `arrow-${event.teamName.replace(/\s+/g, '-')}`;
    const { sx, sy, mx, my, tx, ty, pathString } = computeSegmentGeometry(event, teamIndex);
    
    // Create glow effect first
    const glowPath = d3Data.pathGroup.append('path')
        .attr('class', `team-path-glow team-path-glow-${teamIndex}`)
        .attr('stroke', teamColor)
        .attr('stroke-width', 8)
        .attr('fill', 'none')
        .attr('opacity', 0.3)
        .attr('filter', 'blur(4px)')
        .attr('d', pathString);
    
    // Create main path
    const mainPath = d3Data.pathGroup.append('path')
        .attr('class', `team-path team-path-${teamIndex}`)
        .attr('stroke', teamColor)
        .attr('stroke-width', 4)
        .attr('fill', 'none')
        .attr('opacity', 0.9)
        .attr('stroke-linecap', 'round')
        .attr('marker-end', `url(#${markerId})`)
        .attr('d', pathString);
    
    // Animate the path drawing
    const totalLength = mainPath.node().getTotalLength();
    
    // Set up the starting positions
    mainPath
        .attr('stroke-dasharray', totalLength + ' ' + totalLength)
        .attr('stroke-dashoffset', totalLength);
    
    glowPath
        .attr('stroke-dasharray', totalLength + ' ' + totalLength)
        .attr('stroke-dashoffset', totalLength);
    
    // Animate both paths
    mainPath.transition()
        .duration(pathAnimationState.speed * 0.7)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);
    
    glowPath.transition()
        .duration(pathAnimationState.speed * 0.7)
        .ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);

    // Temps écoulé entre les deux résolutions, affiché une fois la flèche tracée
    const timeLabel = drawPathTimeLabel(sx, sy, mx, my, tx, ty,
        event.toSolve.date - event.fromSolve.date, teamColor);
    if (timeLabel) {
        timeLabel
            .attr('opacity', 0)
            .transition()
            .delay(pathAnimationState.speed * 0.7)
            .duration(200)
            .attr('opacity', 1);
    }

    // Add pulsing effect to destination node
    const destNode = d3Data.nodeGroup.selectAll('.d3-challenge-node')
        .filter(d => d.id === event.toSolve.id);
    
    destNode.transition()
        .duration(200)
        .style('filter', 'drop-shadow(0 0 10px ' + teamColor + ')')
        .transition()
        .duration(200)
        .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))');
}

/**
 * Toggle between static and animated path modes
 */
function togglePathAnimation() {
    if (pathAnimationState.sessionActive) {
        stopPathAnimation();
        // Show all paths at once (static mode)
        updateTeamPathsStatic();
        updateAnimateButton('Animer');
    } else {
        startPathAnimation();
        updateAnimateButton('Arrêter');
    }
}

/**
 * Update the animation button text
 */
function updateAnimateButton(text) {
    const btn = document.getElementById('animate-btn');
    if (btn) {
        const active = pathAnimationState.sessionActive;
        btn.innerHTML = (active ? D3_ICON_STOP : D3_ICON_PLAY) + '<span>' + text + '</span>';
        btn.classList.toggle('active', active);
    }
}

/**
 * Set animation speed
 */
function setAnimationSpeed(speed) {
    pathAnimationState.speed = speed;
}

/**
 * Change animation speed multiplier
 */
function changeAnimationSpeed(multiplier) {
    pathAnimationState.speedMultiplier = multiplier;
    
    // Update UI to show active speed button
    document.querySelectorAll('#animation-controls .control-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the corresponding button
    const buttons = document.querySelectorAll('#animation-controls .control-btn');
    const speeds = [0.5, 1, 2, 5];
    const index = speeds.indexOf(multiplier);
    if (index !== -1 && buttons[index]) {
        buttons[index].classList.add('active');
    }
}

/**
 * Calculate all solve events across teams
 */
function calculateAllSolveEvents() {
    const allSolveEvents = [];
    
    Object.entries(pathAnimationState.teamSolveSequences).forEach(([teamName, solves]) => {
        solves.forEach((solve, index) => {
            if (index > 0) { // Skip first solve (no path to draw)
                allSolveEvents.push({
                    teamName,
                    fromSolve: solves[index - 1],
                    toSolve: solve,
                    date: solve.date
                });
            }
        });
    });
    
    // Sort all events by date
    allSolveEvents.sort((a, b) => a.date - b.date);
    return allSolveEvents;
}

/**
 * Initialize timeline display
 */
function initializeTimeline() {
    const events = pathAnimationState.allEvents;
    if (events.length === 0) return;
    
    const startTime = pathAnimationState.startTime;
    const endTime = pathAnimationState.endTime;
    const totalDuration = endTime - startTime;
    
    document.getElementById('timeline-start').textContent = '00:00:00';
    document.getElementById('timeline-end').textContent = formatCumulativeDuration(totalDuration);
    document.getElementById('timeline-current-time').textContent = '00:00:00';
    document.getElementById('timeline-team').textContent = '-';
    document.getElementById('timeline-challenge').textContent = 'Prêt à commencer';
    document.getElementById('timeline-duration').textContent = '-';
    document.getElementById('timeline-fill').style.width = '0%';
}

/**
 * Update timeline display
 */
function updateTimeline(currentEvent, currentStep, totalSteps) {
    const events = pathAnimationState.allEvents;
    if (events.length === 0) return;
    
    const currentTime = currentEvent.date;
    const startTime = pathAnimationState.startTime;
    const endTime = pathAnimationState.endTime;
    
    // Calculate cumulative time since competition start
    const cumulativeTime = currentTime - startTime;
    const totalDuration = endTime - startTime;
    const progress = (cumulativeTime / totalDuration) * 100;
    
    // Calculate duration since previous solve for this team
    let duration = 'Premier flag';
    if (currentEvent.fromSolve) {
        const timeDiff = currentTime - currentEvent.fromSolve.date;
        duration = formatDuration(timeDiff);
    }
    
    // Update display
    document.getElementById('timeline-current-time').textContent = formatCumulativeDuration(cumulativeTime);
    document.getElementById('timeline-team').textContent = `Équipe: ${currentEvent.teamName}`;
    document.getElementById('timeline-challenge').textContent = `Challenge: ${currentEvent.toSolve.node.name}`;
    document.getElementById('timeline-duration').textContent = `Délai: ${duration}`;
    document.getElementById('timeline-fill').style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

/**
 * Show/hide timeline
 */
function showTimeline() {
    document.getElementById('animation-timeline').style.display = 'block';
}

function hideTimeline() {
    document.getElementById('animation-timeline').style.display = 'none';
}

/**
 * Show/hide animation controls
 */
function showAnimationControls() {
    document.getElementById('animation-controls').style.display = 'flex';
    // Set default speed active
    changeAnimationSpeed(1);
}

function hideAnimationControls() {
    document.getElementById('animation-controls').style.display = 'none';
}

/**
 * Format time for display
 */
function formatTime(date) {
    if (!date) return '00:00:00';
    
    if (typeof date === 'string') {
        date = new Date(date);
    }
    
    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(milliseconds) {
    if (!milliseconds || milliseconds < 0) return '0s';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Format cumulative duration for timeline display (DD:HH:MM:SS format)
 */
function formatCumulativeDuration(milliseconds) {
    if (!milliseconds || milliseconds < 0) return '00:00:00';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);
    
    // Format according to duration length
    if (days > 0) {
        return `${days}j ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else if (totalHours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

/**
 * Update team paths in static mode (show all at once)
 */
function updateTeamPathsStatic() {
    // This is the original updateTeamPaths function logic
    // Clear existing paths
    d3Data.pathGroup.selectAll('*').remove();
    
    // Setup markers
    setupTeamMarkers();
    
    // Draw all paths at once (original logic from the existing function)
    window.selectedTeams.forEach((teamName, teamIndex) => {
        const team = window.teams.find(t => t.name === teamName);
        if (!team) return;
        
        const teamColor = team.color || `hsl(${teamIndex * 360 / window.selectedTeams.length}, 70%, 50%)`;
        const markerId = `arrow-${teamName.replace(/\s+/g, '-')}`;
        
        // Get solved challenges for this team, sorted by date
        const solvedChallenges = [];
        if (window.teamProgress[teamName]) {
            Object.entries(window.teamProgress[teamName]).forEach(([challengeId, progress]) => {
                if ((progress.solved === true || progress.status === 'solved') && progress.date) {
                    const node = d3Data.nodes.find(n => n.id === challengeId);
                    if (node) {
                        solvedChallenges.push({
                            id: challengeId,
                            date: new Date(progress.date),
                            node: node
                        });
                    }
                }
            });
        }
        
        // Sort by solve date
        solvedChallenges.sort((a, b) => a.date - b.date);
        
        if (solvedChallenges.length < 2) {
            return;
        }
        
        // Create path data
        const pathData = [];
        for (let i = 0; i < solvedChallenges.length - 1; i++) {
            const source = solvedChallenges[i].node;
            const target = solvedChallenges[i + 1].node;
            
            pathData.push({
                source: source,
                target: target,
                elapsedMs: solvedChallenges[i + 1].date - solvedChallenges[i].date,
                index: i
            });
        }
        
        // Adjust paths to avoid node overlaps
        const offset = (teamIndex - (window.selectedTeams.length - 1) / 2) * 20;
        
        // Draw all paths for this team
        pathData.forEach(d => {
            const edges = getEdgePoint(d.source, d.target, D3_CONFIG.nodeWidth, D3_CONFIG.nodeHeight);
            const sx = edges.source.x;
            const sy = edges.source.y;
            const tx = edges.target.x;
            const ty = edges.target.y;
            
            // Calculate control point for quadratic bezier curve
            const dx = tx - sx;
            const dy = ty - sy;
            const dr = Math.sqrt(dx * dx + dy * dy);
            
            // Offset perpendicular to the line
            const offsetX = -dy / dr * offset;
            const offsetY = dx / dr * offset;
            
            const mx = (sx + tx) / 2 + offsetX;
            const my = (sy + ty) / 2 + offsetY;
            
            const pathString = `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;
            
            // Draw glow path
            d3Data.pathGroup.append('path')
                .attr('class', `team-path-glow team-path-glow-${teamIndex}`)
                .attr('stroke', teamColor)
                .attr('stroke-width', 8)
                .attr('fill', 'none')
                .attr('opacity', 0.3)
                .attr('filter', 'blur(4px)')
                .attr('d', pathString);
            
            // Draw main path
            d3Data.pathGroup.append('path')
                .attr('class', `team-path team-path-${teamIndex}`)
                .attr('stroke', teamColor)
                .attr('stroke-width', 4)
                .attr('fill', 'none')
                .attr('opacity', 0.9)
                .attr('stroke-linecap', 'round')
                .attr('marker-end', `url(#${markerId})`)
                .attr('d', pathString);

            // Temps écoulé entre les deux résolutions
            drawPathTimeLabel(sx, sy, mx, my, tx, ty, d.elapsedMs, teamColor);
        });
    });
}

// Export D3 functions for global access with error protection
window.initializeD3Visualization = safeD3Operation(initializeD3Visualization, 'initialization');
window.renderD3Challenges = safeD3Operation(renderD3Challenges, 'rendering');
window.zoomInD3 = safeD3Operation(zoomInD3, 'zoom in');
window.zoomOutD3 = safeD3Operation(zoomOutD3, 'zoom out');
window.resetViewD3 = safeD3Operation(resetViewD3, 'reset view');
window.fitToScreenD3 = safeD3Operation(fitToScreenD3, 'fit to screen');
window.isD3Ready = safeD3Operation(isD3Ready, 'readiness check');
window.updateTeamPaths = safeD3Operation(updateTeamPaths, 'update team paths');
window.togglePathAnimation = safeD3Operation(togglePathAnimation, 'toggle path animation');
window.startPathAnimation = safeD3Operation(startPathAnimation, 'start path animation');
window.stopPathAnimation = safeD3Operation(stopPathAnimation, 'stop path animation');
window.changeAnimationSpeed = safeD3Operation(changeAnimationSpeed, 'change animation speed');
window.togglePlayPause = safeD3Operation(togglePlayPause, 'toggle play/pause');
window.stepAnimation = safeD3Operation(stepAnimation, 'step animation');
window.refreshTeamPaths = safeD3Operation(refreshTeamPaths, 'refresh team paths');

// Export d3Data for debugging
window.d3Data = d3Data;

