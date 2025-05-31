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
        link: 0.3,
        charge: -800,
        collision: 150,
        center: 0.1
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
 * Initialize D3.js visualization system with robust error handling
 */
async function initializeD3Visualization() {
    console.log('🎨 Initializing D3.js visualization system...');
    
    try {
        // Check if D3 is available
        if (typeof d3 === 'undefined') {
            console.error('❌ D3.js library not loaded');
            return false;
        }
        
        // Check container immediately first (fast path)
        let container = checkContainerImmediate('map-container');
        if (!container) {
            console.log('🔄 Container not immediately ready, waiting...');
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
    
    // Setup groups
    d3Data.linkGroup = d3Data.zoomContainer.select('#d3-links');
    d3Data.nodeGroup = d3Data.zoomContainer.select('#d3-nodes');
    
    // Initialize zoom behavior
    setupD3Zoom();
    
    // Initialize force simulation
    setupD3ForceSimulation();
    
        // Setup resize handler
        window.addEventListener('resize', handleD3Resize);
        
        console.log('✅ D3.js visualization system initialized successfully');
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
            .distance(200)
            .strength(D3_CONFIG.forceStrength.link)
        )
        .force('charge', d3.forceManyBody()
            .strength(D3_CONFIG.forceStrength.charge)
        )
        .force('collision', d3.forceCollide()
            .radius(D3_CONFIG.forceStrength.collision)
        )
        .force('center', d3.forceCenter(0, 0)
            .strength(D3_CONFIG.forceStrength.center)
        )
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
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
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
        const node = {
            id: id,
            name: challenge.name,
            category: challenge.category || 'General',
            points: challenge.points || 0,
            dependencies: challenge.dependencies || [],
            position: challenge.position || { x: 0, y: 0 },
            status: getChallengeStatus(id, teamProgress),
            teamIndicators: getChallengeTeamIndicators(id),
            // D3 positioning
            x: challenge.position?.x || Math.random() * 800,
            y: challenge.position?.y || Math.random() * 600,
            fx: customPositions[id]?.x, // Fixed position if manually placed
            fy: customPositions[id]?.y
        };
        nodes.push(node);
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
    
    return { nodes, links };
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

/**
 * Render challenges using D3.js with comprehensive error handling
 */
function renderD3Challenges() {
    // Comprehensive readiness check
    if (!isD3Ready()) {
        console.warn('D3 not ready, falling back to legacy rendering');
        return renderLegacyChallenges();
    }
    
    try {
        console.log('🎨 Rendering challenges with D3.js...');
        
        // Convert data
        const data = convertToD3Data(challengeMap, teamProgress);
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
        
        // Start simulation with adaptive alpha based on graph size
        const alpha = d3Data.nodes.length > 50 ? 0.1 : 0.3;
        d3Data.simulation.alpha(alpha).restart();
        
        console.log(`✅ Rendered ${d3Data.nodes.length} nodes and ${d3Data.links.length} links`);
        
    } catch (error) {
        console.error('❌ Error rendering D3 challenges:', error);
        console.error('Error rendering visualization, falling back to legacy mode');
        renderLegacyChallenges();
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
        .attr('stroke', '#6366f1')
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
        .text(d => d.category);
    
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
        .style('fill', '#ffffff')
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
            if (!event.active) d3Data.simulation.alphaTarget(0.3).restart();
            
            // Add dragging visual feedback
            d3.select(this).classed('dragging', true);
            
            // Fix the node position
            d.fx = d.x;
            d.fy = d.y;
            
            // Store original position
            d._originalFx = d.fx;
            d._originalFy = d.fy;
            
            console.log(`🎯 Started dragging: ${d.name}`);
        })
        .on('drag', function(event, d) {
            // Update node position
            d.fx = event.x;
            d.fy = event.y;
            
            // Force immediate update
            d3Data.simulation.alpha(0.1).restart();
        })
        .on('end', function(event, d) {
            if (!event.active) d3Data.simulation.alphaTarget(0);
            
            // Remove dragging visual feedback
            d3.select(this).classed('dragging', false);
            
            // Save custom position
            customPositions[d.id] = { x: d.fx, y: d.fy };
            challengeMap[d.id].position = { x: d.fx, y: d.fy };
            
            // Save to session storage
            saveCustomPositions();
            
            // Show success notification
            console.log(`Challenge "${d.name}" position saved`);
            
            console.log(`✅ Finished dragging: ${d.name} to (${Math.round(d.fx)}, ${Math.round(d.fy)})`);
        });
}

/**
 * Update D3 positions during simulation tick
 */
function updateD3Positions() {
    // Update node positions
    d3Data.nodeGroup.selectAll('.d3-challenge-node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
    
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
        .attr('fill', d => getChallengeColor(d.status).background)
        .attr('stroke', d => getChallengeColor(d.status).border);
    
    nodes.select('.d3-challenge-status')
        .attr('fill', d => getChallengeColor(d.status).status);
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
                .attr('stroke', '#ffffff')
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
        // Single team view
        const teamName = currentUser.teamName;
        if (teamProgress[teamName] && teamProgress[teamName][challengeId]) {
            const progress = teamProgress[teamName][challengeId];
            return progress.status === 'solved' ? 'solved' : 'attempted';
        }
        return 'available';
    } else {
        // Multi-team view
        let solvedCount = 0;
        let hasAttempts = false;
        let teamsWithAccess = 0;
        
        for (const teamName of selectedTeams) {
            if (teamProgress[teamName] && teamProgress[teamName][challengeId] && 
                teamProgress[teamName][challengeId].status === 'solved') {
                teamsWithAccess++;
                solvedCount++;
                
                // Vérifier les vraies données de submissions
                const team = teams.find(t => t.name === teamName);
                if (team && team.id && window.teamSubmissionsCache && window.teamSubmissionsCache[team.id]) {
                    const failsForChallenge = window.teamSubmissionsCache[team.id][challengeId] || 0;
                    if (failsForChallenge > 0) {
                        hasAttempts = true;
                    }
                }
            }
            // On ignore les équipes qui n'ont pas résolu le challenge
        }
        
        // Si aucune équipe sélectionnée n'a accès au challenge
        if (teamsWithAccess === 0) return 'available';
        
        // Si au moins une équipe a des fails ou a tenté sans réussir
        if (hasAttempts) {
            return 'attempted';
        }
        
        // Si toutes les équipes avec accès ont résolu sans fails
        if (solvedCount === teamsWithAccess) {
            return 'solved';
        }
        
        // Cas par défaut
        return 'available';
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
            solved = progress.status === 'solved';
        }
        
        return {
            team: teamName,
            color: team ? team.color : '#6b7280',
            solved: solved
        };
    }).filter(indicator => indicator.solved);
}

function getChallengeColor(status) {
    const colors = {
        solved: {
            background: 'url(#gradient-solved)',
            border: '#10b981',
            status: '#10b981'
        },
        attempted: {
            background: 'url(#gradient-attempted)',
            border: '#f59e0b',
            status: '#f59e0b'
        },
        available: {
            background: 'url(#gradient-available)',
            border: '#3b82f6',
            status: '#3b82f6'
        },
        locked: {
            background: 'url(#gradient-locked)',
            border: '#d1d5db',
            status: '#9ca3af'
        }
    };
    
    return colors[status] || colors.available;
}

function getStatusIcon(status) {
    const icons = {
        solved: '✓',
        attempted: '⚡',
        available: '●',
        locked: '🔒'
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
    
    console.log(`Showing details for challenge: ${challenge.name}`);
    // This would normally show a detailed modal
    // For now, just show a notification
    console.log(`Challenge: ${challenge.name} (${challenge.points} pts)`);
}

/**
 * Team selection integration
 */
function onTeamSelectionChange() {
    // Refresh D3 visualization when team selection changes
    if (window.renderD3Challenges && d3Data.svg) {
        console.log('🔄 Refreshing D3 visualization due to team selection change');
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

// Export D3 functions for global access with error protection
window.initializeD3Visualization = safeD3Operation(initializeD3Visualization, 'initialization');
window.renderD3Challenges = safeD3Operation(renderD3Challenges, 'rendering');
window.zoomInD3 = safeD3Operation(zoomInD3, 'zoom in');
window.zoomOutD3 = safeD3Operation(zoomOutD3, 'zoom out');
window.resetViewD3 = safeD3Operation(resetViewD3, 'reset view');
window.fitToScreenD3 = safeD3Operation(fitToScreenD3, 'fit to screen');
window.isD3Ready = safeD3Operation(isD3Ready, 'readiness check');

console.log('📦 D3.js Challenge Visualization System loaded with error protection');