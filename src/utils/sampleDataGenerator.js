import fs from 'fs/promises';

const generateRowsForCampaign = (campaignName, startDate, endDate, config) => {
  const rows = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const { clicks, impr, cpc, cost, conv, convVal, ctr, cvr, imprShare, lostBudget, lostRank, qs } = config;
    
    rows.push([
      dateStr, campaignName, "Ad Group 1", "Keyword A", "Exact",
      clicks, impr, `${(ctr * 100).toFixed(2)}%`, cpc.toFixed(2), cost.toFixed(2),
      conv, convVal.toFixed(2), `${(cvr * 100).toFixed(2)}%`, 
      `${(imprShare * 100).toFixed(0)}%`, `${(lostBudget * 100).toFixed(0)}%`, `${(lostRank * 100).toFixed(0)}%`, qs
    ]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return rows;
};

export const generateSampleCSV = async (outputPath) => {
  const headers = "Day,Campaign,Ad group,Keyword,Match type,Clicks,Impressions,CTR,Avg. CPC,Cost,Conversions,Conv. value,Conv. rate,Search Impr. share,Search Lost IS (budget),Search Lost IS (rank),Quality Score";
  
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);

  let csvContent = headers + "\n";

  const campaigns = [
    { name: "Brand - Exact", p1: { clicks: 42, impr: 1000, cpc: 1.2, cost: 50, conv: 4, convVal: 325, ctr: 0.042, cvr: 0.08, imprShare: 0.9, lostBudget: 0, lostRank: 0.05, qs: 9 } },
    { name: "Generic Keywords - BMM", p1: { clicks: 10, impr: 1000, cpc: 2.0, cost: 20, conv: 0, convVal: 0, ctr: 0.01, cvr: 0, imprShare: 0.5, lostBudget: 0, lostRank: 0.3, qs: 5 }, p2: { clicks: 5, impr: 1000, cpc: 2.0, cost: 10, conv: 0, convVal: 0, ctr: 0.005, cvr: 0, imprShare: 0.5, lostBudget: 0, lostRank: 0.3, qs: 4 } },
    { name: "Competitor Targeting", p1: { clicks: 5, impr: 500, cpc: 8.5, cost: 42.5, conv: 0, convVal: 0, ctr: 0.01, cvr: 0.004, imprShare: 0.4, lostBudget: 0, lostRank: 0.4, qs: 3 } },
    { name: "Remarketing - Display", p1: { clicks: 3, impr: 1000, cpc: 0.5, cost: 1.5, conv: 0, convVal: 0, ctr: 0.003, cvr: 0, imprShare: 0.8, lostBudget: 0, lostRank: 0.1, qs: "--" } },
    { name: "Shopping - Products", p1: { clicks: 100, impr: 5000, cpc: 0.8, cost: 80, conv: 1, convVal: 40, ctr: 0.02, cvr: 0.01, imprShare: 0.3, lostBudget: 0.5, lostRank: 0.1, qs: "--" } }
  ];

  campaigns.forEach(c => {
    const p1Rows = generateRowsForCampaign(c.name, twoWeeksAgo, oneWeekAgo, c.p1);
    const p2Rows = generateRowsForCampaign(c.name, oneWeekAgo, today, c.p2 || c.p1);
    [...p1Rows, ...p2Rows].forEach(row => csvContent += row.join(",") + "\n");
  });

  await fs.writeFile(outputPath, csvContent);
  return outputPath;
};
