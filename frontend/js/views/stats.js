import { fetchJournalStats } from "../api.js";
import { renderMonthlyChart } from "../components/charts.js";

// Lazy load Chart.js only when stats view is loaded
export async function renderStats(container) {
    container.innerHTML = `
        <div class="stats-container">
            <h2 class="stats-title">Journal Statistics</h2>
            <div class="stats-summary">
                <div class="stat-card">
                    <div class="stat-value" id="total-entries">-</div>
                    <div class="stat-label">Total Entries</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="active-months">-</div>
                    <div class="stat-label">Active Months</div>
                </div>
            </div>
            <div class="stats-charts">
                <div class="chart-container">
                    <h3>Entries by Month</h3>
                    <div class="chart-wrapper">
                        <canvas id="monthly-chart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    try {
        // Fetch statistics from API
        const stats = await fetchJournalStats();
        
        // Update summary cards
        document.getElementById("total-entries").textContent = stats.total_entries;
        document.getElementById("active-months").textContent = stats.by_month.length;
        
        // Lazy load Chart.js only when needed
        try {
            await import('../vendor/chart.umd.min.js');
        } catch (error) {
            console.error("Failed to load Chart.js:", error);
            // Chart rendering will fail, but we can still show the data
            document.querySelector('.chart-wrapper').innerHTML = 
                '<p class="chart-error">Chart visualization unavailable</p>';
        }
        
        // Render the chart
        renderMonthlyChart("monthly-chart", stats.by_month);
        
    } catch (error) {
        console.error("Failed to load statistics:", error);
        container.innerHTML = `
            <div class="error-state">
                <p>Failed to load statistics.</p>
                <p>Please try again later.</p>
            </div>
        `;
    }
}