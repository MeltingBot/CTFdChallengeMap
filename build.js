#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

/**
 * CTFd Map Build Script
 * Generates minified versions of JavaScript files while preserving originals
 */

const config = {
    // Files to minify
    files: [
        {
            input: 'app.js',
            output: 'app.min.js'
        },
        {
            input: 'app-d3.js', 
            output: 'app-d3.min.js'
        }
    ],
    
    // Terser minification options
    terserOptions: {
        compress: {
            drop_console: false, // Keep console.log for debugging
            drop_debugger: true,
            pure_funcs: ['debugLog'], // Remove debugLog calls
            dead_code: true,
            unused: true
        },
        mangle: {
            reserved: [
                // Preserve important global functions
                'connectToAPI',
                'logout', 
                'refreshData',
                'toggleTeam',
                'selectAllTeams',
                'deselectAllTeams',
                'selectSingleTeam',
                'setViewMode',
                'zoomIn',
                'zoomOut', 
                'resetView',
                'fitToScreen',
                'showAboutModal',
                'hideAboutModal',
                'togglePathAnimation',
                'changeAnimationSpeed',
                'resetChallengePositions',
                'showCORSInstructions',
                'showQuickSetup',
                'useCORSProxy',
                'toggleTeamStatusFilter',
                'sortTeamsBy',
                // D3 functions exposed globally
                'initializeD3Visualization',
                'renderD3Challenges',
                'zoomInD3',
                'zoomOutD3',
                'resetViewD3',
                'fitToScreenD3',
                'updateTeamPaths',
                'startPathAnimation',
                'stopPathAnimation'
            ]
        },
        format: {
            comments: false, // Remove comments
            beautify: false
        }
    }
};

async function minifyFile(inputFile, outputFile) {
    try {
        console.log(`🔨 Minifying ${inputFile} → ${outputFile}`);
        
        // Read the original file
        const inputPath = path.join(__dirname, inputFile);
        const outputPath = path.join(__dirname, outputFile);
        
        if (!fs.existsSync(inputPath)) {
            console.error(`❌ Input file not found: ${inputFile}`);
            return false;
        }
        
        const originalCode = fs.readFileSync(inputPath, 'utf8');
        const originalSize = originalCode.length;
        
        // Minify the code
        const result = await minify(originalCode, config.terserOptions);
        
        if (result.error) {
            console.error(`❌ Minification error for ${inputFile}:`, result.error);
            return false;
        }
        
        // Write the minified file
        fs.writeFileSync(outputPath, result.code, 'utf8');
        
        const minifiedSize = result.code.length;
        const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        
        console.log(`✅ ${inputFile}: ${originalSize} → ${minifiedSize} bytes (-${reduction}%)`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error minifying ${inputFile}:`, error.message);
        return false;
    }
}

async function updateIndexHtml() {
    try {
        console.log(`🔨 Creating production index.html`);
        
        const indexPath = path.join(__dirname, 'index.html');
        const prodIndexPath = path.join(__dirname, 'index.prod.html');
        
        if (!fs.existsSync(indexPath)) {
            console.error(`❌ index.html not found`);
            return false;
        }
        
        let htmlContent = fs.readFileSync(indexPath, 'utf8');
        
        // Replace script references with minified versions
        htmlContent = htmlContent.replace(
            '<script src="app-d3.js"></script>',
            '<script src="app-d3.min.js"></script>'
        );
        
        htmlContent = htmlContent.replace(
            '<script src="app.js"></script>',
            '<script src="app.min.js"></script>'
        );
        
        // Add a comment indicating this is the production version
        htmlContent = htmlContent.replace(
            '<!DOCTYPE html>',
            `<!DOCTYPE html>
<!-- Production build with minified JavaScript files -->`
        );
        
        fs.writeFileSync(prodIndexPath, htmlContent, 'utf8');
        
        console.log(`✅ Created index.prod.html with minified script references`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error creating production index.html:`, error.message);
        return false;
    }
}

async function createBuildInfo() {
    const buildInfo = {
        timestamp: new Date().toISOString(),
        version: require('./package.json').version,
        files: {},
        stats: {
            originalSize: 0,
            minifiedSize: 0,
            totalReduction: 0
        }
    };
    
    // Calculate file sizes
    for (const file of config.files) {
        const inputPath = path.join(__dirname, file.input);
        const outputPath = path.join(__dirname, file.output);
        
        if (fs.existsSync(inputPath) && fs.existsSync(outputPath)) {
            const originalSize = fs.statSync(inputPath).size;
            const minifiedSize = fs.statSync(outputPath).size;
            
            buildInfo.files[file.input] = {
                original: originalSize,
                minified: minifiedSize,
                reduction: ((originalSize - minifiedSize) / originalSize * 100).toFixed(1) + '%'
            };
            
            buildInfo.stats.originalSize += originalSize;
            buildInfo.stats.minifiedSize += minifiedSize;
        }
    }
    
    buildInfo.stats.totalReduction = 
        ((buildInfo.stats.originalSize - buildInfo.stats.minifiedSize) / buildInfo.stats.originalSize * 100).toFixed(1) + '%';
    
    fs.writeFileSync(
        path.join(__dirname, 'build-info.json'),
        JSON.stringify(buildInfo, null, 2)
    );
    
    console.log(`📊 Build info saved to build-info.json`);
    console.log(`📈 Total reduction: ${buildInfo.stats.totalReduction}`);
}

async function main() {
    console.log('🚀 Starting CTFd Map build process...\n');
    
    let allSuccess = true;
    
    // Minify all JavaScript files
    for (const file of config.files) {
        const success = await minifyFile(file.input, file.output);
        if (!success) allSuccess = false;
    }
    
    // Create production HTML
    const htmlSuccess = await updateIndexHtml();
    if (!htmlSuccess) allSuccess = false;
    
    // Create build info
    if (allSuccess) {
        await createBuildInfo();
    }
    
    console.log(`\n${allSuccess ? '✅' : '❌'} Build ${allSuccess ? 'completed successfully' : 'completed with errors'}`);
    
    if (allSuccess) {
        console.log('\n📦 Production files created:');
        config.files.forEach(file => {
            console.log(`   - ${file.output}`);
        });
        console.log('   - index.prod.html');
        console.log('   - build-info.json');
        console.log('\n💡 Use index.prod.html for production deployment');
    }
    
    process.exit(allSuccess ? 0 : 1);
}

// Run the build
main().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
});