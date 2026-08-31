import ssaArtifactJson from '../../data/mortality/ssa-period-life-table-2023.json';
import {
  canonicalChecksum,
  canonicalRowLine,
  getHeadlineLifeExpectancy,
  getSsaQx,
  ssaArtifact
} from './artifacts';

describe('SSA artifact accessors', () => {
  test('canonical row encoding matches language-neutral format', () => {
    expect(canonicalRowLine('male', 0, 0.006015, 100000, 75.79)).toBe(
      'male|0|0.006015|100000|75.79\n'
    );
    expect(canonicalRowLine('female', 65, 0.010188, 87399, 20.66)).toBe(
      'female|65|0.010188|87399|20.66\n'
    );
  });

  test('artifact checksum matches language-neutral canonical payload', () => {
    expect(canonicalChecksum(ssaArtifact.data)).toBe(ssaArtifact.checksumSha256);
    expect(ssaArtifact.checksumSha256).toBe(
      '0633dca104495208a36f0413d0fa6f492d489a4a7a13c491f5102e44ff84f715'
    );
    expect(ssaArtifact).toBe(ssaArtifactJson);
  });

  test('getSsaQx returns exact decimal probabilities', () => {
    expect(getSsaQx('male', 65)).toBe(ssaArtifact.data.male[65].qx);
    expect(() => getSsaQx('unknown', 65)).toThrow(/unsupported sex/i);
    expect(() => getSsaQx('male', 120)).toThrow(/supported age/i);
  });

  test('getHeadlineLifeExpectancy is SSA life expectancy at birth', () => {
    expect(getHeadlineLifeExpectancy('male')).toBe(ssaArtifact.data.male[0].ex);
    expect(getHeadlineLifeExpectancy('female')).toBe(ssaArtifact.data.female[0].ex);
  });
});
