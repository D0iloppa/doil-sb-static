(function () {
  const LEGAL = {
    terms: {
      kicker: 'Terms of Use',
      title: '이용약관',
      body: `
        <h3>제1조 목적</h3>
        <p>이 약관은 월천 자미두수가 제공하는 자미두수 명반 작성, 콘텐츠 열람, 상담 신청 및 이메일 상담 서비스의 이용 조건과 권리, 의무, 책임사항을 정합니다.</p>
        <h3>제2조 서비스의 성격</h3>
        <ul>
          <li>명반 작성과 해석 콘텐츠는 자미두수에 기반한 참고용 정보입니다.</li>
          <li>상담은 이용자가 제공한 출생정보와 상담 내용을 바탕으로 이메일로 진행됩니다.</li>
          <li>본 서비스는 의료, 법률, 투자, 심리치료 등 전문 자격이 필요한 판단을 대체하지 않습니다.</li>
        </ul>
        <h3>제3조 상담 신청과 진행</h3>
        <p>이용자는 이름, 성별, 이메일, 생년월일, 태어난 시간, 출생지역, 상담 내용을 정확히 입력해야 하며, 정보가 부정확한 경우 상담 결과의 정확성이 제한될 수 있습니다.</p>
        <h3>제4조 이용자의 의무</h3>
        <ul>
          <li>타인의 개인정보 또는 허위 정보를 이용해 상담을 신청해서는 안 됩니다.</li>
          <li>서비스 운영을 방해하거나 부정한 방법으로 사이트를 이용해서는 안 됩니다.</li>
          <li>상담 결과와 사이트 콘텐츠를 운영자의 동의 없이 상업적으로 복제, 배포, 판매해서는 안 됩니다.</li>
        </ul>
        <h3>제5조 상담 취소 및 환불</h3>
        <p>상담 취소 및 환불 조건은 실제 결제 여부, 풀이 작성 착수 여부, 제공 완료 여부에 따라 개별 안내합니다. 이미 상담 풀이가 발송된 경우 단순 변심에 의한 환불이 제한될 수 있습니다.</p>
        <h3>제6조 개인정보 보호</h3>
        <p>운영자는 상담 신청 및 응대에 필요한 범위에서만 개인정보를 처리하며, 자세한 사항은 개인정보처리방침에 따릅니다.</p>
        <h3>제7조 책임의 제한</h3>
        <p>명반 및 상담 결과는 해석과 조언의 성격을 가지며, 이용자의 선택과 그 결과에 대한 최종 책임은 이용자에게 있습니다.</p>
        <h3>시행일</h3>
        <p>2026년 5월 17일</p>
      `,
    },
    privacy: {
      kicker: 'Privacy Policy',
      title: '개인정보처리방침',
      body: `
        <h3>1. 개인정보의 처리 목적</h3>
        <p>월천 자미두수는 상담 신청 접수, 명반 작성, 상담 풀이 제공, 상담 결과 발송, 추가 질문 응대, 상담비 안내 및 분쟁 예방을 위해 개인정보를 처리합니다.</p>
        <h3>2. 처리하는 개인정보 항목</h3>
        <ul>
          <li>필수: 이름, 성별, 이메일 주소, 생년월일, 태어난 시간, 상담 내용</li>
          <li>선택: 출생 지역</li>
          <li>자동 또는 외부 서비스 관련 정보: 이메일 발송 기록, 접수 및 응대 일시, 일반적인 접속 로그</li>
        </ul>
        <h3>3. 보유 및 이용 기간</h3>
        <p>상담 신청 정보와 상담 내용은 상담 완료일로부터 1년간 보관한 뒤 파기합니다. 다만 이용자가 삭제를 요청하면 법령상 보존이 필요한 경우를 제외하고 지체 없이 삭제합니다.</p>
        <ul>
          <li>상담 신청 및 상담 내용: 상담 완료 후 1년</li>
          <li>상담비 정산 및 거래 확인 자료: 관계 법령상 필요한 범위에서 최대 5년</li>
          <li>분쟁 대응 기록: 분쟁 처리 완료 후 필요한 최소 기간 또는 관계 법령상 보존 기간</li>
        </ul>
        <h3>4. 제3자 제공</h3>
        <p>운영자는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 다만 이용자의 동의가 있거나 법령상 제공 의무가 있는 경우는 예외로 합니다.</p>
        <h3>5. 처리 위탁 및 외부 서비스</h3>
        <p>상담 신청 폼은 이메일 전송을 위해 EmailJS 등 외부 이메일 전송 서비스를 이용합니다. 입력한 상담 신청 정보는 이메일 발송, 자동 회신, 수신 기록 관리를 위한 범위에서 처리됩니다.</p>
        <h3>6. 파기 절차 및 방법</h3>
        <p>보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자 파일은 복구하기 어렵도록 삭제하고, 출력물이 있는 경우 분쇄 또는 이에 준하는 방법으로 파기합니다.</p>
        <h3>7. 이용자의 권리</h3>
        <p>이용자는 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 요청은 felicitas9@naver.com 으로 보내주시면 확인 후 처리합니다.</p>
        <h3>8. 안전성 확보 조치</h3>
        <p>상담 정보 접근 권한을 운영상 필요한 범위로 제한하고, 이메일 계정과 외부 서비스 계정의 접근 권한을 관리합니다. 상담 내용은 외부 공개, 마케팅, 사례 게시 등에 사용하지 않습니다.</p>
        <h3>시행일</h3>
        <p>2026년 5월 17일</p>
      `,
    },
  };

  function ensurePopup() {
    let overlay = document.querySelector('[data-legal-popup]');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'legal-popup-overlay';
    overlay.dataset.legalPopup = 'true';
    overlay.innerHTML = `
      <div class="legal-popup" role="dialog" aria-modal="true" aria-labelledby="legal-popup-title">
        <div class="legal-popup-head">
          <div>
            <div class="legal-popup-kicker" data-legal-kicker></div>
            <div class="legal-popup-title" id="legal-popup-title" data-legal-title></div>
          </div>
          <button type="button" class="legal-popup-close" data-legal-close aria-label="닫기">×</button>
        </div>
        <div class="legal-popup-body" data-legal-body></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-legal-close]')) closePopup();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closePopup();
    });

    return overlay;
  }

  function openPopup(type) {
    const data = LEGAL[type];
    if (!data) return;
    const overlay = ensurePopup();
    overlay.querySelector('[data-legal-kicker]').textContent = data.kicker;
    overlay.querySelector('[data-legal-title]').textContent = data.title;
    overlay.querySelector('[data-legal-body]').innerHTML = data.body;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('[data-legal-close]').focus();
  }

  function closePopup() {
    const overlay = document.querySelector('[data-legal-popup]');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-legal-open]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openPopup(trigger.dataset.legalOpen);
  });

  window.openLegalPopup = openPopup;
  window.closeLegalPopup = closePopup;
})();
