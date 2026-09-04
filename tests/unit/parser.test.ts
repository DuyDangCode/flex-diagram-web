import { describe, it, expect } from 'vitest';
import { parseDSL } from '../../lib/parser/parser';
import { generateStableId } from '../../lib/reconciler/stable_id';

describe('Stable ID Generator', () => {
  it('slugifies simple names', () => {
    expect(generateStableId('Client')).toBe('client');
    expect(generateStableId('Auth Service')).toBe('auth-service');
    expect(generateStableId('Order-Service-v2')).toBe('order-service-v2');
  });

  it('handles spaces and symbols', () => {
    expect(generateStableId('  PostgreSQL (Primary)  ')).toBe('postgresql-primary');
    expect(generateStableId('App & Web / Gateway')).toBe('app-web-gateway');
  });

  it('handles special-only characters gracefully', () => {
    const id = generateStableId('???');
    expect(id).toMatch(/^node-[0-9a-f]+$/);
  });
});

describe('DSL Parser', () => {
  it('parses empty input', () => {
    const ast = parseDSL('');
    expect(ast.nodes).toHaveLength(0);
    expect(ast.edges).toHaveLength(0);
    expect(ast.errors).toHaveLength(0);
  });

  it('parses whitespace and comments only', () => {
    const ast = parseDSL(`
      // Just a comment
      /* Multi-line
         comment */
    `);
    expect(ast.nodes).toHaveLength(0);
    expect(ast.edges).toHaveLength(0);
    expect(ast.errors).toHaveLength(0);
  });

  it('parses standalone nodes of different shapes', () => {
    const ast = parseDSL(`
      [Client]
      (Database)
      <Decision>
    `);
    expect(ast.nodes).toHaveLength(3);
    expect(ast.nodes[0]).toMatchObject({ id: 'client', name: 'Client', shape: 'rectangle' });
    expect(ast.nodes[1]).toMatchObject({ id: 'database', name: 'Database', shape: 'cylinder' });
    expect(ast.nodes[2]).toMatchObject({ id: 'decision', name: 'Decision', shape: 'diamond' });
    expect(ast.errors).toHaveLength(0);
  });

  it('parses simple directed edge with label', () => {
    const ast = parseDSL(`
      [Client] -> [Gateway] : REST Request
    `);
    expect(ast.nodes).toHaveLength(2);
    expect(ast.edges).toHaveLength(1);
    expect(ast.edges[0]).toMatchObject({
      id: 'client->gateway',
      sourceId: 'client',
      targetId: 'gateway',
      label: 'REST Request',
    });
    expect(ast.errors).toHaveLength(0);
  });

  it('parses chained edges', () => {
    const ast = parseDSL(`
      [Client] -> [Gateway] -> [Auth Service]
    `);
    expect(ast.nodes).toHaveLength(3);
    expect(ast.edges).toHaveLength(2);
    expect(ast.edges[0]).toMatchObject({ sourceId: 'client', targetId: 'gateway' });
    expect(ast.edges[1]).toMatchObject({ sourceId: 'gateway', targetId: 'auth-service' });
    expect(ast.errors).toHaveLength(0);
  });

  it('parses multiple statements with mixed shapes', () => {
    const dsl = `
      [Client] -> [Gateway] : REST
      [Gateway] -> [Auth Service] : gRPC
      [Gateway] -> [Order Service] : gRPC
      [Order Service] -> (Database) : SQL Write
      (Database) -> [Analytics Engine] : CDC Event
    `;
    const ast = parseDSL(dsl);
    expect(ast.nodes).toHaveLength(6);
    expect(ast.edges).toHaveLength(5);

    const dbNode = ast.nodes.find((n) => n.id === 'database');
    expect(dbNode?.shape).toBe('cylinder');
    expect(ast.errors).toHaveLength(0);
  });

  it('generates unique IDs for multiple edges between same nodes', () => {
    const dsl = `
      [A] -> [B] : Request
      [A] -> [B] : Retry
    `;
    const ast = parseDSL(dsl);
    expect(ast.edges).toHaveLength(2);
    expect(ast.edges[0].id).toBe('a->b');
    expect(ast.edges[1].id).toBe('a->b#2');
  });

  it('recovers from syntax errors on individual lines', () => {
    const dsl = `
      [Valid 1] -> [Valid 2]
      [Unterminated
      [Valid 3] -> [Valid 4]
    `;
    const ast = parseDSL(dsl);
    // Should still have recovered and parsed Valid 1, Valid 2, Valid 3, Valid 4
    expect(ast.nodes.length).toBeGreaterThanOrEqual(4);
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toContain('Unterminated');
  });

  it('ignores @layout metadata comment block', () => {
    const dsl = `
      [Client] -> [Gateway]
      
      // @layout:v1
      // {
      //   "version": 1,
      //   "nodes": {
      //     "client": { "x": 100, "y": 150, "pinned": true }
      //   }
      // }
    `;
    const ast = parseDSL(dsl);
    expect(ast.nodes).toHaveLength(2);
    expect(ast.edges).toHaveLength(1);
    expect(ast.errors).toHaveLength(0);
  });

  it('supports PlantUML compatibility: single-quote comments, directives, and dotted arrows', () => {
    const dsl = `
      @startuml
      !theme plain
      skinparam componentStyle rectangle

      ' Section 1
      [Client] -> [Gateway] : HTTPS
      [Gateway] ..> (Cache) : Cache Hit
      [Gateway] --> [Database] : Direct SQL
      <Router> <..> [Gateway]

      @enduml
    `;
    const ast = parseDSL(dsl);
    expect(ast.errors).toHaveLength(0);
    expect(ast.nodes).toHaveLength(5);
    expect(ast.edges).toHaveLength(4);

    const dottedEdge = ast.edges.find((e) => e.sourceId === 'gateway' && e.targetId === 'cache');
    expect(dottedEdge?.style).toBe('dotted');

    const solidEdge = ast.edges.find((e) => e.sourceId === 'client' && e.targetId === 'gateway');
    expect(solidEdge?.style).toBe('solid');
  });

  it('successfully parses the full complex microservices PlantUML diagram with 0 errors', () => {
    const dsl = `
      @startuml
      !theme plain
      skinparam componentStyle rectangle

      ' --- 1. Người dùng & Gateway ---
      [Web / Mobile Client] -> [Cloudflare CDN] : HTTPS / WAF
      [Cloudflare CDN] -> [API Gateway / Kong] : Reverse Proxy
      [API Gateway / Kong] -> [OAuth2 / Auth Service] : JWT Verification (gRPC)

      ' --- 2. Xử lý nghiệp vụ chính (Write Path & Read Cache) ---
      [API Gateway / Kong] -> [Order Service] : Create Order (gRPC)
      [Order Service] -> [Redis Cluster] : Check Idempotency Key
      [Order Service] -> (PostgreSQL Master DB) : ACID Transaction (SQL Write)

      ' --- 3. Đọc dữ liệu nhanh & Read Replicas ---
      [API Gateway / Kong] -> [Product Catalog Service] : Get Products (gRPC)
      [Product Catalog Service] -> [Redis Cache] : Read Cache Hit
      [Product Catalog Service] ..> (PostgreSQL Read Replica) : Cache Miss (SQL Read)

      ' --- 4. Đồng bộ CDC & Event-Driven Streaming ---
      (PostgreSQL Master DB) -> [Debezium CDC Connector] : WAL Logs Capture
      [Debezium CDC Connector] -> [Kafka Event Bus] : Produce: "order.created"
      [Order Service] -> [Kafka Event Bus] : Outbox Pattern Fallback

      ' --- 5. Xử lý hạ tầng phía sau (Consumers) ---
      [Kafka Event Bus] -> [Inventory Worker] : Consume "order.created"
      [Inventory Worker] -> (PostgreSQL Master DB) : Lock & Deduct Stock

      [Kafka Event Bus] -> [Payment Worker] : Consume "order.created"
      [Payment Worker] -> [Stripe / VNPay API] : External HTTPS Call

      [Kafka Event Bus] -> [Notification Worker] : Event Trigger
      [Notification Worker] -> [FCM / SendGrid] : Push Noti & Send Email

      ' --- 6. Pipeline Dữ liệu lớn & Báo cáo (Analytics) ---
      [Kafka Event Bus] -> [Apache Flink] : Stream Processing
      [Apache Flink] -> (ClickHouse OLAP) : Aggregated Metrics
      (ClickHouse OLAP) -> [Metabase / Tableau] : BI Dashboard Queries

      ' --- 7. Giám sát & Quan sát hệ thống (Observability) ---
      [Order Service] ..> [OpenTelemetry Collector] : Traces / Spans
      [OpenTelemetry Collector] -> (Jaeger / Grafana Tempo) : Trace Ingestion

      @enduml
    `;
    const ast = parseDSL(dsl);
    expect(ast.errors).toHaveLength(0);
    expect(ast.nodes.length).toBeGreaterThanOrEqual(20);
    expect(ast.edges.length).toBeGreaterThanOrEqual(20);

    const openTelEdge = ast.edges.find((e) => e.sourceId === 'order-service' && e.targetId === 'opentelemetry-collector');
    expect(openTelEdge).toBeDefined();
    expect(openTelEdge?.style).toBe('dotted');
  });
});
