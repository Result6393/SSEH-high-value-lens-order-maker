import { describe, expect, it } from 'vitest';
import { LensMemory } from './lens-memory';

const zcu = { model: 'ZCU300', power: '+22.0D', company: '' };
const cna = { model: 'CNA0T5', power: '+21.5D', company: '' };

describe('LensMemory', () => {
  it('keeps a choice per eye and lens family', () => {
    const m = new LensMemory();
    m.remember('Right', 'ZCU', zcu);
    m.remember('Right', 'CNA0T', cna);
    m.remember('Left', 'ZCU', { ...zcu, power: '+21.0D' });
    expect(m.recall('Right', 'ZCU')).toEqual(zcu);
    expect(m.recall('Right', 'CNA0T')).toEqual(cna);
    expect(m.recall('Left', 'ZCU')?.power).toBe('+21.0D');
    expect(m.recall('Left', 'CNA0T')).toBeUndefined();
    expect(m.recall('Right', 'Other')).toBeUndefined();
  });

  it('overwrites with the latest choice and returns copies', () => {
    const m = new LensMemory();
    m.remember('Right', 'ZCU', zcu);
    m.remember('Right', 'ZCU', { ...zcu, power: '+20.5D' });
    const got = m.recall('Right', 'ZCU')!;
    expect(got.power).toBe('+20.5D');
    got.power = 'changed';
    expect(m.recall('Right', 'ZCU')?.power).toBe('+20.5D');
  });

  it('gives a choice made before any eye was selected to the first eye chosen only', () => {
    const m = new LensMemory();
    m.remember(undefined, 'ZCU', zcu);
    expect(m.recall(undefined, 'ZCU')).toEqual(zcu);
    expect(m.recall('Right', 'ZCU')).toEqual(zcu);
    expect(m.recall('Left', 'ZCU')).toBeUndefined();
    expect(m.recall('Right', 'ZCU')).toEqual(zcu);
  });

  it('forgets everything on clear', () => {
    const m = new LensMemory();
    m.remember('Right', 'ZCU', zcu);
    m.clear();
    expect(m.recall('Right', 'ZCU')).toBeUndefined();
  });
});
