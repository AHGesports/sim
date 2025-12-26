import { describe, expect, it } from 'vitest'
import { Decimal, toDecimal, toFixedString, toNumber } from './decimal'

describe('billing decimal utilities', () => {
  describe('toDecimal', () => {
    it('handles null/undefined/empty as zero', () => {
      expect(toNumber(toDecimal(null))).toBe(0)
      expect(toNumber(toDecimal(undefined))).toBe(0)
      expect(toNumber(toDecimal(''))).toBe(0)
    })

    it('parses string numbers', () => {
      expect(toNumber(toDecimal('123.456'))).toBe(123.456)
      expect(toNumber(toDecimal('0.001'))).toBe(0.001)
    })

    it('handles numbers directly', () => {
      expect(toNumber(toDecimal(42))).toBe(42)
      expect(toNumber(toDecimal(0))).toBe(0)
    })
  })

  describe('decimal arithmetic precision', () => {
    it('avoids floating point errors in addition', () => {
      const result = toDecimal(0.1).plus(toDecimal(0.2))
      expect(toNumber(result)).toBe(0.3)
    })

    it('avoids floating point errors in subtraction', () => {
      const result = toDecimal(0.3).minus(toDecimal(0.1))
      expect(toNumber(result)).toBe(0.2)
    })

    it('handles accumulation without drift', () => {
      let sum = new Decimal(0)
      for (let i = 0; i < 1000; i++) {
        sum = sum.plus(toDecimal(0.001))
      }
      expect(toNumber(sum)).toBe(1)
    })
  })

  describe('Decimal.max', () => {
    it('returns zero for negative results', () => {
      const result = Decimal.max(0, toDecimal(5).minus(10))
      expect(toNumber(result)).toBe(0)
    })

    it('returns positive difference', () => {
      const result = Decimal.max(0, toDecimal(10).minus(5))
      expect(toNumber(result)).toBe(5)
    })
  })

  describe('toFixedString', () => {
    it('formats to 6 decimal places by default', () => {
      expect(toFixedString(toDecimal(1.234))).toBe('1.234000')
    })

    it('respects custom decimal places', () => {
      expect(toFixedString(toDecimal(1.234), 2)).toBe('1.23')
    })
  })
})
