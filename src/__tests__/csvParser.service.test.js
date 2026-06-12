const fs = require('fs');
const { parseGoogleAdsCSV } = require('../services/csvParser.service');

describe('csvParser.service', () => {
  const tempFilePath = './temp_test.csv';

  afterEach(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  test('should parse a small CSV string correctly', async () => {
    const csvContent = `Day,Campaign,Clicks,Impressions,Cost
2024-01-01,Campaign A,10,100,1.50
2024-01-02,Campaign A,20,200,3.00`;
    fs.writeFileSync(tempFilePath, csvContent);

    const parsedData = await parseGoogleAdsCSV(tempFilePath);
    expect(parsedData.rows.length).toBe(2);
    expect(parsedData.rows[0].campaign).toBe('Campaign A');
    expect(parsedData.rows[0].clicks).toBe(10);
    expect(parsedData.rows[1].impressions).toBe(200);
  });

  test('should normalize column names like \"Cost ($)\" to \"cost\"\', async () => {
    const csvContent = `Day,Campaign,Cost ($),Clicks
2024-01-01,Campaign B,5.25,50`;
    fs.writeFileSync(tempFilePath, csvContent);

    const parsedData = await parseGoogleAdsCSV(tempFilePath);
    expect(parsedData.rows[0].cost).toBe(5.25);
  });

  test('should split 14 days of data into two 7-day periods correctly', async () => {
    let csvContent = `Day,Campaign,Clicks,Impressions,Cost\n`;
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.UTC(2024, 0, 1 + i));
      csvContent += `${date.toISOString().slice(0, 10)},Campaign X,${i + 1},${(i + 1) * 10},${(i + 1) * 0.5}\n`;
    }
    fs.writeFileSync(tempFilePath, csvContent);

    const parsedData = await parseGoogleAdsCSV(tempFilePath);
    expect(parsedData.periods.current.length).toBe(7);
    expect(parsedData.periods.previous.length).toBe(7);
    expect(parsedData.periods.current[0].date).toBe('2024-01-08');
    expect(parsedData.periods.previous[0].date).toBe('2024-01-01');
  });

  test('should throw a descriptive error for an empty file', async () => {
    fs.writeFileSync(tempFilePath, '');
    await expect(parseGoogleAdsCSV(tempFilePath)).rejects.toThrow('CSV file is empty');
  });

  test('should throw a descriptive error for non-CSV content', async () => {
    fs.writeFileSync(tempFilePath, 'this is not csv content');
    await expect(parseGoogleAdsCSV(tempFilePath)).rejects.toThrow('No recognizable Google Ads columns found');
  });
});
