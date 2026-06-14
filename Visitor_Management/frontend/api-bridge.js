// API bridge: connects the frontend flow to the Express/Postgres backend.
// IMPORTANT: vms_fixed.html calls these functions (submitReg/sendNotif/activateVisit/doCheckout)
// IMPORTANT: UI markup/layout is NOT changed.

(function initBridge(){
  const BASE = window.location.origin + '/api'; // dynamic — works on any host/port

  function getJSON(res){
    return res.json().catch(() => ({}));
  }

  async function request(path, { method='GET', body=null } = {}){
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await getJSON(res);
    if(!res.ok || (data && data.ok === false)){
      const msg = data && data.error ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  // Hosts/RFID/Appointment (optional helpers)
  window.apiListHosts = async function(){
    return (await request('/hosts')).data || [];
  };

  window.apiLookupAppointment = async function(code){
    return await request(`/appointments/lookup?code=${encodeURIComponent(code)}`);
  };

  window.apiListRfidAvailable = async function(){
    const res = await request('/rfid/available');
    if (!res || !res.data || !Array.isArray(res.data.cards)) {
      throw new Error('Failed to load RFID cards: unexpected response format');
    }
    return res.data.cards;
  };

  // GET /api/visits/:id — fetch visit record by ID
  window.apiFetchVisitById = async function(id) {
    const res = await request(`/visits/${id}`);
    return res && res.data ? res.data : null;
  };

  // GET /api/visits/by-phone?phone=… — real DB-backed returning-visitor lookup
  window.apiFetchVisitorByPhone = async function(phone, countryCode){
    const res = await request(`/visits/by-phone?phone=${encodeURIComponent(phone)}&country_code=${encodeURIComponent(countryCode || 'IN')}`);
    console.log('[apiFetchVisitorByPhone] request URL', `/visits/by-phone?phone=${encodeURIComponent(phone)}&country_code=${encodeURIComponent(countryCode || 'IN')}`);
    console.log('[apiFetchVisitorByPhone] response', res);
    const visitor = res && res.data ? res.data.visitor : null;
    console.log('[apiFetchVisitorByPhone] visitor', visitor);
    if (visitor && visitor.id_number) {
      // Update the global state and UI for ID number
      S.v.idNumber = visitor.id_number; // store raw ID
      const idInput = document.getElementById('fidnum');
      if (idInput) {
        console.log('[apiFetchVisitorByPhone] setting fidnum', visitor.id_number);
        idInput.value = visitor.id_number;
        // Trigger input handling to apply formatting/masking as needed
        if (typeof onIdInput === 'function') onIdInput(idInput);
        // Dispatch native input event to ensure any listeners react
        idInput.dispatchEvent(new Event('input'));
      }
    }
    return visitor;
  };

  // GET /api/visits/active-lookup?q=… — find an active visit by phone, email, id, or rfid
  window.apiLookupActiveVisit = async function(query){
    const res = await request(`/visits/active-lookup?q=${encodeURIComponent(query)}`);
    console.log('[apiLookupActiveVisit] response', res);
    return res && res.data && res.data.length > 0 ? res.data[0] : null;
  };

  // Explicit helper: fetch full returning-visitor detail by phone.
  // Returns the same shape as /by-phone but named to signal "full detail" intent in UI code.
  window.fetchReturningVisitorDetail = async function(phone, countryCode){
    const res = await request(`/visits/by-phone?phone=${encodeURIComponent(phone)}&country_code=${encodeURIComponent(countryCode || 'IN')}`);
    return res && res.data ? res.data.visitor : null;
  };

  // Visits lifecycle
  window.apiCreateVisit = async function(payload){
    // payload must match backend/routes/visits.js POST /api/visits
    return await request('/visits', { method:'POST', body: payload });
  };

  window.apiSignAgreement = async function(visitId, signed=true){
    return await request(`/visits/${visitId}/agreement`, { method:'PATCH', body:{ signed: !!signed } });
  };

  window.apiNotifyHost = async function(visitId){
    return await request(`/visits/${visitId}/notify`, { method:'POST', body:{} });
  };

  window.apiActivateVisit = async function(visitId, rfid_tag, badge_type, qr_code){
    return await request(`/visits/${visitId}/activate`, { method:'POST', body:{ rfid_tag: rfid_tag || null, badge_type: badge_type || 'rfid', qr_code: qr_code || null } });
  };

  window.apiCheckoutVisit = async function(visitId){
    return await request(`/visits/${visitId}/checkout`, { method:'POST', body:{ rfid_confirmed:true } });
  };

  window.apiDownloadReport = async function(visitId) {
    const res = await fetch(`${BASE}/visits/${visitId}/report`, { method: 'GET' });
    if (!res.ok) throw new Error(`Report generation failed (${res.status})`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breakthru_visit_${visitId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

// --- OVERRIDES FOR vms_fixed.html ---
   /**
    * Note: The database hosts table already uses 'h1', 'h2', 'h3', 'h4' as IDs.
    * The frontend HOSTS array uses these same IDs, so no mapping is needed.
    */
   window.sendApprovalRequest = async function() {
    try {
      const payload = {
        name: S.v.name,
        company: S.v.company,
        email: S.v.email,
        phone: S.v.phone,
        countryCode: S.v.countryCode,
        purpose: S.v.purpose,
        host_id: S.v.hostId, // Already matches database format
        id_type: S.v.idType,
        id_number: S.v.idType === 'Aadhaar Card' ? (S.v.idNumberRaw || '').replace(/\s/g, '') : S.v.idNumber,
        visitor_type: S.v.visitorType,
        team_name: S.v.teamName,
        team_count: S.v.teamCount,
        team_members: S.v.teamMembers,
        photo_b64: S.photo || '',
        verified_contact_method: S.otp && S.otp.otpVerified ? S.otp.method : null,
        verified_mobile: !!(S.otp && S.otp.otpVerified && S.otp.method === 'phone'),
        verified_email: !!(S.otp && S.otp.otpVerified && S.otp.method === 'email'),
        verification_timestamp: S.otp && S.otp.otpVerified ? new Date().toISOString() : null
      };

      console.log('[sendApprovalRequest] Creating visit with payload:', { ...payload, photo_b64: payload.photo_b64 ? '(base64 data)' : '(none)' });
      
      const createRes = await window.apiCreateVisit(payload);
      console.log('[sendApprovalRequest] Visit created, response:', createRes);
      
      if (!createRes || !createRes.data || !createRes.data.id) {
        throw new Error('Visit creation failed - no ID returned');
      }
      
      S.dbVisitId = createRes.data.id;
      console.log('[sendApprovalRequest] dbVisitId set to:', S.dbVisitId);

      // Also save/overwrite the photo deterministically (idempotent PATCH)
      if (S.photo) {
        try { await request(`/visits/${S.dbVisitId}/photo`, { method: 'PATCH', body: { photo_b64: S.photo } }); } catch(_e) { /* non-blocking */ }
      }

      console.log('[sendApprovalRequest] Notifying host for visit:', S.dbVisitId);
      await window.apiNotifyHost(S.dbVisitId);
      console.log('[sendApprovalRequest] Host notification complete');

      console.log('[Approval] Sent via backend API.');
      S.approvalSent = true;
      
      // Return true to indicate success
      return true;
    } catch (err) {
      console.error('[Integration Error]', err);
      // Reset approvalSent on failure
      S.approvalSent = false;
      throw err;
    }
  };

  window.startApprovalPolling = function() {
    if (S.poller) clearInterval(S.poller);
    
    const poll = async () => {
      try {
        if (!S.dbVisitId) return;
        const res = await request(`/visits/${S.dbVisitId}/status`);
        const status = res.data?.approval_status;
        
        if (status === 'approved') {
          if (S.poller) clearInterval(S.poller);
          S.approved = true;
          if (typeof goStep === 'function') goStep(6);
          if (typeof setStatus === 'function') setStatus('Access approved! Please assign a physical RFID card.', 'ok'); 
          setTimeout(() => { if (typeof hideStatus === 'function') hideStatus(); }, 4500);
        } else if (status === 'denied' || status === 'rejected') {
          if (S.poller) clearInterval(S.poller);
          S.approved = false;
          if (typeof toast === 'function') toast('Host declined the visit request.', 'err');
          if (typeof setStatus === 'function') setStatus('Visit request rejected by host.', 'err');
          if (typeof goStep === 'function') goStep(6);
        }
      } catch (err) {
        console.error('[Poll Error]', err);
      }
    };
    
    S.poller = setInterval(poll, 3000);
  };

  window.activateVisit = async function(overrideBadgeType) {
    const isQr = overrideBadgeType === 'qr';
    Store.setBadgeType(overrideBadgeType || 'rfid');
    if (isQr) {
      S.rfid = null;
    } else if (!S.rfid) {
      toast('Please select an RFID card slot first.', 'err');
      return;
    }

    const dbVisitId = S.dbVisitId;
    const visitorId = S.v.id || S.v.visitorId || dbVisitId;
    const sessionId = S.sessionId;

    console.log('[Activate Diagnostics]', {
      dbVisitId,
      visitorId,
      sessionId,
      badgeType: isQr ? 'qr' : 'rfid',
      rfidTag: isQr ? null : S.rfid,
      qrGenerated: false
    });

    if (!dbVisitId) {
      toast('Visit record not found. Cannot activate.', 'err');
      return;
    }

    let qrCode = null;
    if (isQr) {
      const baseUrl = window.location.origin;
      const qrUrl = `${baseUrl}/badge/${dbVisitId}`;
      try {
        const qr = qrcode(0, 'M');
        qr.addData(qrUrl);
        qr.make();
        const imgTag = qr.createSvgTag({ cellSize: 4, margin: 2 });
        qrCode = `data:image/svg+xml;base64,${btoa(imgTag)}`;
        console.log('[Activate Diagnostics] QR generated:', { qrUrl, qrCodePresent: !!qrCode });
      } catch (e) {
        console.error('[QR] generation failed', e);
        toast('QR generation failed. Please try again.', 'err');
        return;
      }
    }

    const requestPayload = {
      rfid_tag: isQr ? null : S.rfid,
      badge_type: isQr ? 'qr' : 'rfid',
      qr_code: qrCode
    };

    try {
      const response = await window.apiActivateVisit(dbVisitId, requestPayload.rfid_tag, requestPayload.badge_type, requestPayload.qr_code);
      console.log('[Activate Diagnostics] API response:', response);

      if (S.photo) {
        try { await request(`/visits/${dbVisitId}/photo`, { method:'PATCH', body:{ photo_b64: S.photo }}); } catch(_e) { /* non-blocking */ }
      }

      if (!isQr) {
        const ok = Store.assignTag(S.rfid, S.v.name);
        if (!ok) { toast('That card is already assigned locally.', 'err'); S.rfid = null; renderPanel(); return; }
      }

      S.inTime = Date.now();
      const h = gh(S.v.hostId);
      Store.addSession({
        id: S.sessionId,
        dbVisitId: dbVisitId,
        name: S.v.name, company: S.v.company,
        email: S.v.email, host: h ? h.name : '—', purpose: S.v.purpose,
        photo: S.photo || '',
        idType: S.v.idType, idNumber: S.v.idNumber, rfid: isQr ? null : S.rfid,
        inTime: S.inTime, status: 'active', hadAppointment: S.apptFound || false,
        visitorType: S.v.visitorType, teamName: S.v.teamName,
        teamCount: S.v.teamCount, teamMembers: S.v.teamMembers?.slice() || [],
        badgeType: isQr ? 'qr' : 'rfid',
      });
      if (typeof saveToHistory === 'function') saveToHistory(S.v);
      if (typeof renderHamBody === 'function') renderHamBody();
      if (typeof goStep === 'function') goStep(0);
      if (typeof toast === 'function') toast(`${isQr ? 'QR Badge' : 'RFID ' + S.rfid} activated. Screen reset for privacy.`, 'ok');
    } catch (err) {
      console.error('[Activate Diagnostics] Frontend error:', {
        dbVisitId,
        visitorId,
        sessionId,
        badgeType: isQr ? 'qr' : 'rfid',
        rfidTag: isQr ? null : S.rfid,
        qrGenerated: !!qrCode,
        error: err.message,
        fullError: err
      });
      if (typeof toast === 'function') toast('Failed to activate visit: ' + err.message, 'err');
    }
  };

  window.doCheckout = async function() {
    const hasRFID = S.rfid && S.rfid.trim() !== '';
    if (hasRFID) {
      const cb = document.getElementById('tagRet');
      if (!cb || !cb.checked) { if (typeof toast === 'function') toast('Confirm RFID card returned before checkout.', 'err'); return; }
    }
    if (!S.dbVisitId) { if (typeof toast === 'function') toast('Database ID missing. Cannot checkout.', 'err'); return; }

    try {
      await window.apiCheckoutVisit(S.dbVisitId);

      S.outTime = Date.now();
      S.lastCompletedSessionId = S.sessionId;
      Store.checkoutSession(S.sessionId);
      if (typeof renderHamBody === 'function') renderHamBody();
      if (typeof goStep === 'function') goStep(9);
    } catch (err) {
      if (typeof toast === 'function') toast('Failed to checkout: ' + err.message, 'err');
    }
  };

  // Also expose as _bridgeActivateVisit for inline HTML function to call
  window._bridgeActivateVisit = window.activateVisit;

  // Also expose doCheckout for inline HTML function to call
  window._bridgeDoCheckout = window.doCheckout;

  window.hamCheckout = async function(id) {
    // Confirmation disabled – proceed with checkout
    try {
      const sess = Store.findSession(id);
      if (sess && sess.dbVisitId) {
        await window.apiCheckoutVisit(sess.dbVisitId);
      } else if (S.sessionId === id && S.dbVisitId) {
        await window.apiCheckoutVisit(S.dbVisitId);
      }
      
      Store.checkoutSession(id);
      S.lastCompletedSessionId = id;
      if (typeof renderHamBody === 'function') renderHamBody();
      // Go to complete screen
      if (typeof goStep === 'function') goStep(9);
      closeModal('coModal');
    } catch (err) {
      if (typeof toast === 'function') toast('Failed to checkout on server: ' + err.message, 'err');
    }
  };

  console.log('[Bridge] api-bridge loaded with UI overrides:', BASE);
})();
