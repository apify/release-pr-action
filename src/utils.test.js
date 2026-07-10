const { formatIncludedPrsList } = require('./utils.js');

test('formatIncludedPrsList formats PR numbers correctly', () => {
    const result = formatIncludedPrsList([1, 5, 10]);
    expect(result).toBe('\n\n## Included Pull Requests\n- #1\n- #5\n- #10');
});

test('formatIncludedPrsList handles empty input', () => {
    expect(formatIncludedPrsList([])).toBe('');
    expect(formatIncludedPrsList(null)).toBe('');
    expect(formatIncludedPrsList(undefined)).toBe('');
});
