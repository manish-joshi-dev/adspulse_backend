const { computePerformanceScore, detectAnomalies, runDiagnostics } = require('../services/diagnostics.service');

describe('diagnostics.service', () => {

  // Mock data for tests
  const mockCampaigns = new Map([
    ['Campaign A', { name: 'Campaign A', totalClicks: 100, totalImpressions: 1000, avgCTR: 0.1, ROAS: 4, avgConversionRate: 0.05, avgImpressionShare: 0.8 }],
    ['Campaign B', { name: 'Campaign B', totalClicks: 5, totalImpressions: 1000, avgCTR: 0.005, ROAS: 1, avgConversionRate: 0.01, avgImpressionShare: 0.4 }], // Low CTR
    ['Campaign C', { name: 'Campaign C', totalClicks: 15, totalImpressions: 1000, avgCTR: 0.015, ROAS: 2, avgConversionRate: 0.02, avgImpressionShare: 0.6 }], // Warning CTR
  ]);

  const mockParsedData = {
    campaigns: mockCampaigns,
    rows: [
      // Period 1
      { date: '2024-01-01', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-02', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-03', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-04', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-05', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-06', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      { date: '2024-01-07', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      // Period 2 (with CTR drop)
      { date: '2024-01-08', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 }, // 30% drop
      { date: '2024-01-09', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      { date: '2024-01-10', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      { date: '2024-01-11', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      { date: '2024-01-12', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      { date: '2024-01-13', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      { date: '2024-01-14', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
    ],
    periods: {
      current: [
        { date: '2024-01-08', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-09', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-10', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-11', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-12', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-13', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
        { date: '2024-01-14', campaign: 'Campaign B', clicks: 7, impressions: 1000, cost: 14, conversions: 0, conversionValue: 0, ctr: 0.007 },
      ],
      previous: [
        { date: '2024-01-01', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-02', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-03', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-04', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-05', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-06', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
        { date: '2024-01-07', campaign: 'Campaign B', clicks: 10, impressions: 1000, cost: 20, conversions: 0, conversionValue: 0, ctr: 0.01 },
      ]
    },
    dataQuality: {
      hasDateColumn: true,
      hasCostData: true,
      hasConversionData: true,
      hasQualityScoreData: true,
      hasImpressionShareData: true,
      missingColumns: [],
      warningMessages: []
    }
  };

  describe('runDiagnostics', () => {
    test('checkLowCTR: campaign with 0.5% CTR should flag LOW_CTR as \'critical\'', () => {
      const diagnostics = runDiagnostics(mockParsedData);
      const flag = diagnostics.find(d => d.flagType === 'LOW_CTR' && d.affectedEntity === 'Campaign B');
      expect(flag).toBeDefined();
      expect(flag.severity).toBe('critical');
    });

    test('checkLowCTR: campaign with 1.5% CTR should flag LOW_CTR as \'warning\'', () => {
      const mockData = {
        ...mockParsedData,
        campaigns: new Map([
          ...mockParsedData.campaigns,
          ['Campaign C', { name: 'Campaign C', totalClicks: 15, totalImpressions: 1000, avgCTR: 0.015, ROAS: 2, avgConversionRate: 0.02, avgImpressionShare: 0.6 }]
        ]),
      };
      const diagnostics = runDiagnostics(mockData);
      const flag = diagnostics.find(d => d.flagType === 'LOW_CTR' && d.affectedEntity === 'Campaign C');
      expect(flag).toBeDefined();
      expect(flag.severity).toBe('warning');
    });

    test('checkLowCTR: campaign with 2.5% CTR should not flag', () => {
      const mockData = {
        ...mockParsedData,
        campaigns: new Map([
          ...mockParsedData.campaigns,
          ['Campaign D', { name: 'Campaign D', totalClicks: 25, totalImpressions: 1000, avgCTR: 0.025, ROAS: 3, avgConversionRate: 0.03, avgImpressionShare: 0.7 }]
        ]),
      };
      const diagnostics = runDiagnostics(mockData);
      const flag = diagnostics.find(d => d.flagType === 'LOW_CTR' && d.affectedEntity === 'Campaign D');
      expect(flag).not.toBeDefined();
    });
  });

  describe('computePerformanceScore', () => {
    test('all-benchmark-level metrics should result in a score between 70-100', () => {
      const campaigns = new Map([
        ['Healthy Campaign', { name: 'Healthy Campaign', totalClicks: 100, totalImpressions: 4000, avgCTR: 0.025, ROAS: 4, avgConversionRate: 0.05, avgImpressionShare: 0.8 }]
      ]);
      const diagnostics = [];
      const scoreResult = computePerformanceScore(campaigns, diagnostics);
      expect(scoreResult.totalScore).toBeGreaterThanOrEqual(70);
      expect(scoreResult.totalScore).toBeLessThanOrEqual(100);
    });

    test('all-zero metrics should result in a score of 0 and band \'Critical\'', () => {
      const campaigns = new Map([
        ['Zero Campaign', { name: 'Zero Campaign', totalClicks: 0, totalImpressions: 0, avgCTR: 0, ROAS: 0, avgConversionRate: 0, avgImpressionShare: 0 }]
      ]);
      const diagnostics = [];
      const scoreResult = computePerformanceScore(campaigns, diagnostics);
      expect(scoreResult.totalScore).toBe(0);
      expect(scoreResult.scoreBand).toBe('Critical');
    });
  });

  describe('detectAnomalies', () => {
    test('25% CTR drop should be flagged as an anomaly', () => {
      const anomalies = detectAnomalies(mockParsedData);
      const ctrAnomaly = anomalies.find(a => a.metricName === 'CTR' && a.affectedEntity === 'Campaign B');
      expect(ctrAnomaly).toBeDefined();
      expect(ctrAnomaly.changePercent).toBeCloseTo(-30);
      expect(ctrAnomaly.direction).toBe('down');
    });

    test('5% CTR drop should NOT be flagged as an anomaly', () => {
      const mildDropData = {
        ...mockParsedData,
        periods: {
          current: mockParsedData.periods.current.map(row => ({
            ...row, ctr: row.ctr * 0.95 // 5% drop
          })),
          previous: mockParsedData.periods.previous
        }
      };
      const anomalies = detectAnomalies(mildDropData);
      const ctrAnomaly = anomalies.find(a => a.metricName === 'CTR' && a.affectedEntity === 'Campaign B');
      expect(ctrAnomaly).not.toBeDefined();
    });
  });
});
