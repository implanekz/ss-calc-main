import { fetchEarnings, saveEarnings, fetchWorkStopLadder, calculatePiaFromEarnings } from './earningsService';
import { ApiError } from './apiClient';

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.resetAllMocks(); });

const jsonResponse = (body) => Promise.resolve({
  ok: true,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(body)
});

const errorResponse = (status, body) => Promise.resolve({
  ok: false,
  status,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(body)
});

describe('fetchEarnings', () => {
  it('maps self/partner onto spouse1/spouse2 in camelCase', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      earnings: [
        { person: 'self', birth_year: 1965, rows: [{ year: 2020, earnings: 90000, is_projected: false }] },
        { person: 'partner', birth_year: 1968, rows: [] }
      ]
    }));

    const result = await fetchEarnings('tok');
    expect(result.spouse1.birthYear).toBe(1965);
    expect(result.spouse1.rows[0]).toEqual({ year: 2020, earnings: 90000, isProjected: false });
    expect(result.spouse1.statementDate).toBeNull();
    expect(result.spouse2.birthYear).toBe(1968);
  });

  it('returns nulls when the user has no records', async () => {
    global.fetch.mockReturnValue(jsonResponse({ earnings: [] }));
    expect(await fetchEarnings('tok')).toEqual({ spouse1: null, spouse2: null });
  });

  it('defaults to empty results when the response omits earnings entirely', async () => {
    global.fetch.mockReturnValue(jsonResponse({}));
    expect(await fetchEarnings('tok')).toEqual({ spouse1: null, spouse2: null });
  });

  it('sends the bearer token in the Authorization header', async () => {
    global.fetch.mockReturnValue(jsonResponse({ earnings: [] }));
    await fetchEarnings('tok');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer tok');
  });

  it('rejects with an ApiError carrying the response status on non-OK responses', async () => {
    global.fetch.mockReturnValue(errorResponse(401, { detail: 'Unauthorized' }));
    await expect(fetchEarnings('tok')).rejects.toThrow(ApiError);
    await expect(fetchEarnings('tok')).rejects.toMatchObject({ status: 401 });
  });
});

describe('saveEarnings', () => {
  it('PUTs to the person-specific route in snake_case', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      person: 'self', birth_year: 1965, rows: [], updated_at: '2026-08-13'
    }));

    await saveEarnings('tok', 'spouse1', {
      birthYear: 1965,
      rows: [{ year: 2020, earnings: 90000, isProjected: false }]
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/earnings/self');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({
      birth_year: 1965,
      rows: [{ year: 2020, earnings: 90000, is_projected: false }],
      statement_date: null
    });
  });

  it('maps spouse2 onto the partner route', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      person: 'partner', birth_year: 1968, rows: [], updated_at: '2026-08-13'
    }));
    await saveEarnings('tok', 'spouse2', { birthYear: 1968, rows: [] });
    expect(global.fetch.mock.calls[0][0]).toContain('/api/earnings/partner');
  });

  it('sends the bearer token in the Authorization header', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      person: 'self', birth_year: 1965, rows: [], updated_at: '2026-08-13'
    }));
    await saveEarnings('tok', 'spouse1', { birthYear: 1965, rows: [] });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer tok');
  });

  it('defaults rows to an empty array when the record omits it', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      person: 'self', birth_year: 1965, rows: [], updated_at: '2026-08-13'
    }));
    await saveEarnings('tok', 'spouse1', { birthYear: 1965 });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ birth_year: 1965, rows: [], statement_date: null });
  });

  it('rejects unknown person keys without calling fetch', async () => {
    await expect(saveEarnings('tok', 'cousin', { birthYear: 1965, rows: [] }))
      .rejects.toThrow('Unknown person: cousin');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('calculatePiaFromEarnings', () => {
  it('posts only banked rows and returns the derived PIA', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      pia: 3414.93,
      aime: 7000,
      years_of_zero_in_top_35: 0,
      awi_approximated: false
    }));

    const result = await calculatePiaFromEarnings({
      birthYear: 1966,
      rows: [
        { year: 2020, earnings: 90000, isProjected: false },
        { year: 2027, earnings: 90000, isProjected: true }
      ]
    });

    expect(result).toEqual({
      pia: 3414.93,
      aime: 7000,
      yearsOfZeroInTop35: 0,
      awiApproximated: false
    });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).earnings_history).toEqual([
      { year: 2020, earnings: 90000, is_projected: false }
    ]);
  });
});

describe('fetchWorkStopLadder', () => {
  it('returns camelCase rungs', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      rungs: [{ stop_age: 62, stop_year: 2027, aime: 5000, pia: 2873 }]
    }));

    const rungs = await fetchWorkStopLadder({
      birthYear: 1965,
      rows: [{ year: 2020, earnings: 90000, isProjected: false }],
      stopAges: [62]
    });

    expect(rungs).toEqual([{ stopAge: 62, stopYear: 2027, aime: 5000, pia: 2873 }]);
  });

  it('maps every rung when multiple stop ages are supplied', async () => {
    global.fetch.mockReturnValue(jsonResponse({
      rungs: [
        { stop_age: 62, stop_year: 2027, aime: 5000, pia: 2873 },
        { stop_age: 67, stop_year: 2032, aime: 6200, pia: 3400 },
        { stop_age: 70, stop_year: 2035, aime: 6500, pia: 4200 }
      ]
    }));

    const rungs = await fetchWorkStopLadder({
      birthYear: 1965,
      rows: [{ year: 2020, earnings: 90000, isProjected: false }],
      stopAges: [62, 67, 70]
    });

    expect(rungs).toEqual([
      { stopAge: 62, stopYear: 2027, aime: 5000, pia: 2873 },
      { stopAge: 67, stopYear: 2032, aime: 6200, pia: 3400 },
      { stopAge: 70, stopYear: 2035, aime: 6500, pia: 4200 }
    ]);
  });

  it('defaults to an empty array when the response omits rungs entirely', async () => {
    global.fetch.mockReturnValue(jsonResponse({}));
    const rungs = await fetchWorkStopLadder({ birthYear: 1965, rows: [], stopAges: [62] });
    expect(rungs).toEqual([]);
  });
});
