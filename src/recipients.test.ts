import { describe, expect, it } from 'vitest';
import { mailtoList, outlookList, parseRecipients } from './recipients';

const four = ['a.one@health.example', 'b.two@health.example', 'c.three@health.example', 'd.four@health.example'];

describe('parseRecipients', () => {
  it('reads every way of separating addresses', () => {
    expect(parseRecipients('a.one@health.example, b.two@health.example, c.three@health.example, d.four@health.example')).toEqual(four);
    expect(parseRecipients('a.one@health.example; b.two@health.example; c.three@health.example; d.four@health.example')).toEqual(four);
    expect(parseRecipients('a.one@health.example\nb.two@health.example\r\nc.three@health.example\n\n d.four@health.example ')).toEqual(four);
    expect(parseRecipients('a.one@health.example b.two@health.example,c.three@health.example;d.four@health.example')).toEqual(four);
  });

  it('copes with Outlook-style display names, including "Last, First"', () => {
    const text = [
      'Kylie Thomas <a.one@health.example>;',
      'Mandal, Jayasree <b.two@health.example>;',
      'Wijaya, Venessa (South Eastern Sydney LHD) <c.three@health.example>; "Santos, Jon" <d.four@health.example>',
    ].join('\n');
    expect(parseRecipients(text)).toEqual(four);
  });

  it('drops duplicates (ignoring case) and keeps the first spelling', () => {
    expect(parseRecipients('A.One@health.example, a.one@HEALTH.example, b.two@health.example')).toEqual(['A.One@health.example', 'b.two@health.example']);
  });

  it('ignores text that is not an address, including trailing junk', () => {
    expect(parseRecipients('')).toEqual([]);
    expect(parseRecipients('Kylie, Jayasree')).toEqual([]);
    expect(parseRecipients('nobody@ a@b')).toEqual([]);
    expect(parseRecipients('mailto:a.one@health.example.')).toEqual(['a.one@health.example']);
  });

  it('formats lists for Outlook (semicolons) and mailto (commas)', () => {
    const text = four.join('\n');
    expect(outlookList(text)).toBe('a.one@health.example; b.two@health.example; c.three@health.example; d.four@health.example');
    expect(mailtoList(text)).toBe(four.join(','));
  });
});
