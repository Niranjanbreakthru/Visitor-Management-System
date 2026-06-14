-- ═══════════════════════════════════════════════════════════
-- Breakthru.ai VMS — PostgreSQL Schema (Clean, Unified)
-- Run this in pgAdmin Query Tool (F5)
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension (REQUIRED)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) HOSTS TABLE (VARCHAR IDs matching existing DB)
CREATE TABLE IF NOT EXISTS hosts (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  department VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO hosts (id, name, email, department) VALUES
('h1', 'Dr. Ananya Sharma', 'niranjan.d.s@breakthru.ai', 'Managing Director'),
('h2', 'Rajesh Menon', 'rajesh@breakthru.ai', 'Head of Engineering'),
('h3', 'Priya Krishnan', 'priyadharshini.s@breakthru.ai', 'VP Operations'),
('h4', 'Suresh Nair', 'suresh@breakthru.ai', 'Head of Security')
ON CONFLICT (id) DO NOTHING;

-- 2) RFID CARDS TABLE (10 visitor slots)
CREATE TABLE IF NOT EXISTS rfid_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag VARCHAR(20) UNIQUE NOT NULL,
  label VARCHAR(50),
  assigned_to_visit UUID,
  assigned_to_name VARCHAR(100),
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO rfid_cards (tag, label) VALUES
('VISITOR-01', 'Visitor Slot 1'),
('VISITOR-02', 'Visitor Slot 2'),
('VISITOR-03', 'Visitor Slot 3'),
('VISITOR-04', 'Visitor Slot 4'),
('VISITOR-05', 'Visitor Slot 5'),
('VISITOR-06', 'Visitor Slot 6'),
('VISITOR-07', 'Visitor Slot 7'),
('VISITOR-08', 'Visitor Slot 8'),
('VISITOR-09', 'Visitor Slot 9'),
('VISITOR-10', 'Visitor Slot 10')
ON CONFLICT DO NOTHING;

-- 3) APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  visitor_name VARCHAR(100) NOT NULL,
  company VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  purpose TEXT,
  host_id VARCHAR(10) REFERENCES hosts(id),
  host_name VARCHAR(100),
  scheduled_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4) VISITS TABLE (main lifecycle table — complete column set)
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(50) UNIQUE DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  company VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  purpose TEXT,
  host_id VARCHAR(10) REFERENCES hosts(id),
  id_type VARCHAR(20),
  id_number VARCHAR(50),
  photo_b64 TEXT,
  had_appointment BOOLEAN DEFAULT FALSE,
  appointment_id UUID REFERENCES appointments(id),
  visitor_type VARCHAR(20) DEFAULT 'Individual',
  team_name VARCHAR(100),
  team_count INTEGER DEFAULT 2,
  agreement_signed BOOLEAN DEFAULT FALSE,
  approval_status VARCHAR(20) DEFAULT 'pending',
  approval_token VARCHAR(80),
  token_expires TIMESTAMP,
  rfid_tag VARCHAR(20) REFERENCES rfid_cards(tag),
  -- Badge type: rfid (physical card) or qr (digital QR code)
  badge_type VARCHAR(10) DEFAULT 'rfid' CHECK (badge_type IN ('rfid','qr')),
  qr_code TEXT,
  qr_status VARCHAR(20) DEFAULT 'active' CHECK (qr_status IN ('active','expired')),
  in_time TIMESTAMP,
  out_time TIMESTAMP,
  duration_minutes INTEGER,
  status VARCHAR(20) DEFAULT 'registered',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- OTP verification fields
  verified_contact_method VARCHAR(10) CHECK (verified_contact_method IN ('phone','email')),
  verified_mobile BOOLEAN DEFAULT FALSE,
  verified_email BOOLEAN DEFAULT FALSE,
  verification_timestamp TIMESTAMP
);

-- 5) TEAM MEMBERS TABLE
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  id_type VARCHAR(20),
  id_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6) OTP VERIFICATION TABLE
CREATE TABLE IF NOT EXISTS otp_verifications (
  id SERIAL PRIMARY KEY,
  method VARCHAR(10) NOT NULL CHECK (method IN ('phone','email')),
  contact VARCHAR(255) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER DEFAULT 0,
  resend_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  UNIQUE(method, contact)
);

-- 7) INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);
CREATE INDEX IF NOT EXISTS idx_visits_approval_token ON visits(approval_token);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_rfid_available ON rfid_cards(available);
CREATE INDEX IF NOT EXISTS idx_team_members_visit ON team_members(visit_id);
CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_verifications(method, contact);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- 8) MIGRATIONS: Add any missing columns to existing DB (safe ALTER TABLE)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS badge_type VARCHAR(10) DEFAULT 'rfid' CHECK (badge_type IN ('rfid','qr'));
ALTER TABLE visits ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS qr_status VARCHAR(20) DEFAULT 'active' CHECK (qr_status IN ('active','expired'));
ALTER TABLE visits ADD COLUMN IF NOT EXISTS verified_contact_method VARCHAR(10);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS verified_mobile BOOLEAN DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS verified_email BOOLEAN DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP;
