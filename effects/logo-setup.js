// ABOUTME: Shared logo interaction setup for all effects
// ABOUTME: Handles coloring and spin animation for the reload "o" icon

function setupLogo(logoElementId, fillColor) {
    const logoObj = document.getElementById(logoElementId);

    logoObj.addEventListener('load', function() {
        const svgDoc = logoObj.contentDocument;
        const letterO = svgDoc.getElementById('reload-o');

        if (!svgDoc) return;

        // Apply fill color to all paths and polygons
        const paths = svgDoc.querySelectorAll('path, polygon');
        paths.forEach(p => p.style.fill = fillColor);

        // Style the circle stroke in the reload icon
        const circles = svgDoc.querySelectorAll('circle');
        circles.forEach(c => c.setAttribute('stroke', fillColor));

        if (letterO) {
            letterO.style.cursor = 'pointer';
            letterO.style.transformOrigin = '405px 302px';
            letterO.style.transition = 'transform 0.3s ease';

            // Add twitch keyframes
            if (!svgDoc.getElementById('twitch-keyframes')) {
                const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
                style.id = 'twitch-keyframes';
                style.textContent = '@keyframes twitch { 0% { transform: rotate(0deg); } 25% { transform: rotate(15deg); } 50% { transform: rotate(-10deg); } 75% { transform: rotate(5deg); } 100% { transform: rotate(0deg); } }';
                svgDoc.documentElement.insertBefore(style, svgDoc.documentElement.firstChild);
            }

            // Twitch on load after a short delay
            setTimeout(function() {
                letterO.style.animation = 'twitch 0.4s ease-in-out';
                setTimeout(function() {
                    letterO.style.animation = '';
                }, 400);
            }, 800);

            letterO.addEventListener('mouseenter', function() {
                letterO.style.transform = 'rotate(45deg)';
            });

            letterO.addEventListener('mouseleave', function() {
                if (!letterO.classList.contains('spinning')) {
                    letterO.style.transform = 'rotate(0deg)';
                }
            });

            letterO.addEventListener('click', function() {
                letterO.style.animation = 'none';
                letterO.offsetHeight; // Trigger reflow
                letterO.style.animation = 'spin 0.5s ease-in-out';

                // Add keyframes to SVG document
                if (!svgDoc.getElementById('spin-keyframes')) {
                    const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
                    style.id = 'spin-keyframes';
                    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                    svgDoc.documentElement.insertBefore(style, svgDoc.documentElement.firstChild);
                }

                setTimeout(function() {
                    letterO.style.animation = '';
                    window.parent.postMessage('remix', '*');
                }, 500);
            });
        }
    });
}
