import ssaPeriodLifeTable2023 from '../../data/mortality/ssa-period-life-table-2023.json';

const SUPPORTED_SEXES = new Set(['male', 'female']);
const MIN_AGE = 0;
const MAX_AGE = 119;
const SEX_ORDER = ['male', 'female'];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rightRotate = (value, amount) => ((value >>> amount) | (value << (32 - amount))) >>> 0;

const sha256Hex = (text) => {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    bytes.push(text.charCodeAt(index) & 0xff);
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }

  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (const part of [high, low]) {
    bytes.push((part >>> 24) & 0xff);
    bytes.push((part >>> 16) & 0xff);
    bytes.push((part >>> 8) & 0xff);
    bytes.push(part & 0xff);
  }

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const words = new Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteIndex = offset + index * 4;
      words[index] = (
        (bytes[byteIndex] << 24)
        | (bytes[byteIndex + 1] << 16)
        | (bytes[byteIndex + 2] << 8)
        | bytes[byteIndex + 3]
      ) >>> 0;
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
};

export const canonicalRowLine = (sex, age, qx, lx, ex) =>
  `${sex}|${age}|${qx.toFixed(6)}|${lx}|${ex.toFixed(2)}\n`;

export const canonicalChecksum = (data) => {
  let payload = '';
  for (const sex of SEX_ORDER) {
    const rows = data[sex];
    for (const row of rows) {
      payload += canonicalRowLine(sex, row.age, row.qx, row.lx, row.ex);
    }
  }
  return sha256Hex(payload);
};

const assertSupportedSex = (sex) => {
  if (!SUPPORTED_SEXES.has(sex)) {
    throw new Error(`Unsupported sex: ${sex}`);
  }
};

const assertSupportedAge = (age) => {
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw new Error(`Age ${age} is outside the supported age range`);
  }
};

const verifySsaArtifact = (artifact) => {
  if (artifact.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion: ${artifact.schemaVersion}`);
  }
  if (artifact.artifactType !== 'ssa-period-life-table') {
    throw new Error(`Unexpected artifactType: ${artifact.artifactType}`);
  }
  if (artifact.supportedAgeRange[0] !== MIN_AGE || artifact.supportedAgeRange[1] !== MAX_AGE) {
    throw new Error('Unexpected supportedAgeRange');
  }

  for (const sex of SEX_ORDER) {
    const rows = artifact.data?.[sex];
    if (!Array.isArray(rows) || rows.length !== 120) {
      throw new Error(`${sex}: expected 120 rows`);
    }
    rows.forEach((row, index) => {
      if (row.age !== index) {
        throw new Error(`${sex}: ages must be 0–119 in order`);
      }
    });
  }

  const expectedChecksum = canonicalChecksum(artifact.data);
  if (artifact.checksumSha256 !== expectedChecksum) {
    throw new Error(
      `checksumSha256 does not match canonical data payload (expected ${expectedChecksum}, got ${artifact.checksumSha256})`
    );
  }
};

export const ssaArtifact = ssaPeriodLifeTable2023;
verifySsaArtifact(ssaArtifact);

export const getSsaQx = (sex, age) => {
  assertSupportedSex(sex);
  assertSupportedAge(age);
  return ssaArtifact.data[sex][age].qx;
};

export const getHeadlineLifeExpectancy = (sex) => {
  assertSupportedSex(sex);
  return ssaArtifact.data[sex][0].ex;
};
