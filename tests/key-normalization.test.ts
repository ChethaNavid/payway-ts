import { describe, it, expect } from 'vitest';
import { PayWayClient } from '../src/index.js';

describe('PayWayClient - RSA Key Normalization', () => {
  // Valid RSA public key for testing (1024-bit)
  const mockRsaPublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I
1ct4N8+TtECjVltAMI/KkYqU77CveVklb+i/VI0nn9QVymldGhZ422gAOBnUY5j0
cNFzlzGJawBDt+aLI49xacOtlhEmq62sn4JZqscCegpCi4IYVPk0QT9ypNOp2NJ3
WHERcKgSSPtFC7ZTrQIDAQAB
-----END PUBLIC KEY-----`;

  describe('key normalization', () => {
    it('should handle public key with literal \\n escape sequences', () => {
      // Simulate key saved in database with literal \n (common issue from copy-paste)
      const malformedKey = "-----BEGIN PUBLIC KEY-----\\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I\\n1ct4N8+TtECjVltAMI/KkYqU77CveVklb+i/VI0nn9QVymldGhZ422gAOBnUY5j0\\ncNFzlzGJawBDt+aLI49xacOtlhEmq62sn4JZqscCegpCi4IYVPk0QT9ypNOp2NJ3\\nWHERcKgSSPtFC7ZTrQIDAQAB\\n-----END PUBLIC KEY-----";

      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        malformedKey
      );

      // Should not throw error and successfully build payload
      const payload = client.buildCompletePreAuthPayload({
        tran_id: "ORDER-123",
        complete_amount: 100
      });

      expect(payload.fields.merchant_auth).toBeDefined();
      expect(payload.fields.merchant_auth.length).toBeGreaterThan(0);
    });

    it('should handle public key on single line', () => {
      const singleLineKey = "-----BEGIN PUBLIC KEY-----MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I1ct4N8+TtECjVltAMI/KkYqU77CveVklb+i/VI0nn9QVymldGhZ422gAOBnUY5j0cNFzlzGJawBDt+aLI49xacOtlhEmq62sn4JZqscCegpCi4IYVPk0QT9ypNOp2NJ3WHERcKgSSPtFC7ZTrQIDAQAB-----END PUBLIC KEY-----";

      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        singleLineKey
      );

      // Should not throw error
      const payload = client.buildCompletePreAuthPayload({
        tran_id: "ORDER-123",
        complete_amount: 100
      });

      expect(payload.fields.merchant_auth).toBeDefined();
      expect(payload.fields.merchant_auth.length).toBeGreaterThan(0);
    });

    it('should handle public key with extra whitespace', () => {
      const keyWithWhitespace = `  
      -----BEGIN PUBLIC KEY-----
      MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I
      1ct4N8+TtECjVltAMI/KkYqU77CveVklb+i/VI0nn9QVymldGhZ422gAOBnUY5j0
      cNFzlzGJawBDt+aLI49xacOtlhEmq62sn4JZqscCegpCi4IYVPk0QT9ypNOp2NJ3
      WHERcKgSSPtFC7ZTrQIDAQAB
      -----END PUBLIC KEY-----
      `;

      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        keyWithWhitespace
      );

      // Should not throw error
      const payload = client.buildCompletePreAuthPayload({
        tran_id: "ORDER-123",
        complete_amount: 100
      });

      expect(payload.fields.merchant_auth).toBeDefined();
    });

    it('should throw error for key without BEGIN marker', () => {
      const invalidKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I-----END PUBLIC KEY-----";

      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        invalidKey
      );

      expect(() => {
        client.buildCompletePreAuthPayload({
          tran_id: "ORDER-123",
          complete_amount: 100
        });
      }).toThrow('Invalid RSA public key: missing BEGIN marker');
    });

    it('should throw error for key without END marker', () => {
      const invalidKey = "-----BEGIN PUBLIC KEY-----MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFkGZU8rk1sCCGxeVEdxHYZs8I";

      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        invalidKey
      );

      expect(() => {
        client.buildCompletePreAuthPayload({
          tran_id: "ORDER-123",
          complete_amount: 100
        });
      }).toThrow('Invalid RSA public key: missing END marker');
    });

    it('should work with properly formatted key', () => {
      const client = new PayWayClient(
        "http://example.com",
        "merchant_123",
        "api_key_456",
        mockRsaPublicKey
      );

      // Should work without any issues
      const payload = client.buildCompletePreAuthPayload({
        tran_id: "ORDER-123",
        complete_amount: 100
      });

      expect(payload.fields.merchant_auth).toBeDefined();
      expect(payload.fields.merchant_auth.length).toBeGreaterThan(0);
    });
  });
});
