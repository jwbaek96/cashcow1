// Google Apps Script Web App URL (배포 후 여기에 붙여넣으세요)
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzqon0c6GTXeYrwBOboP9Sm8pjgxHGUCrWI6BGVKqNfMvEGV2P2n0IguXteKV-GIx1y/exec";

let currentLink = "";
let userPassword = localStorage.getItem("appPassword") || "";

// 페이지 로드 시 로그인 상태 확인
window.onload = function() {
    if (userPassword) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
    }
};

// 로그인 함수
function login() {
    const pw = document.getElementById('accessPassword').value;
    if (!pw) return alert("비밀번호를 입력하세요.");
    
    // 로컬 저장 (실제 검증은 API 요청 시 GAS에서 수행)
    userPassword = pw;
    localStorage.setItem("appPassword", pw);
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    // 로그인 시도 겸 테스트로 링크 검증이나 빈 요청을 날려볼 수도 있지만, 일단 통과시킴
}

// 공통 GAS 호출 함수 (비밀번호 자동 포함)
async function callGas(action, data = {}) {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                password: userPassword,
                action: action, 
                ...data 
            })
        });
        const result = await response.json();

        // 관리자가 비밀번호를 바꾼 경우 처리
        if (result.status === "error" && result.message === "비밀번호가 일치하지 않습니다.") {
            alert("인증 정보가 만료되었거나 비밀번호가 틀립니다. 다시 로그인해주세요.");
            localStorage.removeItem("appPassword");
            location.reload();
            throw new Error("Unauthorized");
        }
        return result;
    } catch (error) {
        if (error.message === "Unauthorized") throw error;
        console.error("GAS Call Error:", error);
        throw error;
    }
}

// 1. 링크 중복 검증
async function verifyLink() {
    const linkInput = document.getElementById('tiktokLink');
    const message = document.getElementById('verifyMessage');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    currentLink = linkInput.value.trim();
    if (!currentLink) {
        alert("링크를 입력해주세요.");
        return;
    }

    message.innerHTML = "검증 중...";
    
    try {
        const result = await callGas('checkDuplicate', { link: currentLink });

        if (result.status === "success" && result.data.exists) {
            message.innerHTML = `<span class="text-danger">⚠️ 이미 시트에 존재하는 링크입니다. (행: ${result.data.row})</span>`;
            analyzeBtn.disabled = true;

            const existing = result.data.existingData;
            document.getElementById('hookResult').value = existing.hook || "";
            document.getElementById('captionResult').value = existing.caption || "";
            document.getElementById('keywordResult').value = existing.keywords || "";
            document.getElementById('resultBox').style.display = "block";
            
            await extractVideo(currentLink);
        } else {
            message.innerHTML = '<span class="text-success">✅ 사용 가능한 링크입니다. 영상을 추출합니다...</span>';
            analyzeBtn.disabled = false;
            await extractVideo(currentLink);
        }
    } catch (error) {
        if (error.message === "Unauthorized") return;
        message.innerHTML = '<span class="text-warning">⚠️ 검증 실패 (GAS URL 및 비밀번호 확인)</span>';
        analyzeBtn.disabled = false;
    }
}

// 1-2. 틱톡 영상 추출 로직
async function extractVideo(link) {
    const extractSection = document.getElementById('extractSection');
    const videoCover = document.getElementById('videoCover');
    const videoTitle = document.getElementById('videoTitle');
    const downloadBtn = document.getElementById('downloadBtn');
    const message = document.getElementById('verifyMessage');

    try {
        const result = await callGas('extractTikTok', { link: link });

        if (result.status === "success") {
            const videoData = result.data;
            videoCover.src = videoData.cover;
            videoTitle.innerText = videoData.title;
            downloadBtn.href = videoData.videoUrl;
            
            extractSection.style.display = "block";
            message.innerHTML += ' <span class="text-success">| 추출 완료!</span>';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        if (error.message === "Unauthorized") return;
        console.error("Extraction error:", error);
        message.innerHTML += ' <span class="text-danger">| 영상 추출 실패</span>';
    }
}

// 2. AI 분석 (Gemini)
async function analyzeVideo() {
    const videoFile = document.getElementById('videoFile').files[0];
    const loading = document.getElementById('loading');
    const resultBox = document.getElementById('resultBox');

    if (!videoFile) {
        alert("분석할 동영상을 선택해주세요.");
        return;
    }

    loading.style.display = "block";
    resultBox.style.display = "none";

    try {
        const base64Video = await fileToBase64(videoFile);
        const prompt = `당신은 인스타그램 마케팅 전문가입니다. 
제공된 영상을 분석하여 다음 형식으로 응답해 주세요:

1. 후킹 문구: 시선을 사로잡는 강력한 핵심 문구 한 줄
2. 인스타그램 캡션: 제품의 장점을 살린 매력적인 문구 (이모지, 해시태그 포함)
3. 상품 키워드: 영상 속 제품을 한 단어로 표현

형식:
[후킹]: (내용)
[캡션]: (내용)
[키워드]: (내용)`;

        const result = await callGas('analyzeVideo', { 
            prompt: prompt,
            videoData: base64Video 
        });

        if (result.status === "success") {
            const text = result.data;
            const hookMatch = text.match(/\[후킹\]:\s*(.*)/);
            const captionMatch = text.match(/\[캡션\]:\s*([\s\S]*?)(?=\[키워드\]|$)/);
            const keywordMatch = text.match(/\[키워드\]:\s*(.*)/);

            document.getElementById('hookResult').value = hookMatch ? hookMatch[1].trim() : "";
            document.getElementById('captionResult').value = captionMatch ? captionMatch[1].trim() : text;
            document.getElementById('keywordResult').value = keywordMatch ? keywordMatch[1].trim() : "추출 실패";
            
            resultBox.style.display = "block";

            if (document.getElementById('keywordResult').value) {
                searchCoupang();
            }
        }
    } catch (error) {
        if (error.message === "Unauthorized") return;
        alert("AI 분석 중 오류가 발생했습니다.");
    } finally {
        loading.style.display = "none";
    }
}

// 3. 쿠팡 상품 검색
async function searchCoupang() {
    const keyword = document.getElementById('keywordResult').value;
    const coupangSection = document.getElementById('coupangSection');
    const coupangList = document.getElementById('coupangList');

    if (!keyword) return;

    coupangList.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-danger"></div> 쿠팡 상품 검색 중...</div>';
    coupangSection.style.display = "block";

    try {
        const result = await callGas('searchCoupang', { keyword: keyword });

        if (result.status === "success" && result.data.length > 0) {
            coupangList.innerHTML = "";
            result.data.forEach((item) => {
                const btn = document.createElement('button');
                btn.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
                btn.innerHTML = `
                    <div class="ms-2 me-auto">
                        <div class="fw-bold" style="font-size: 0.9rem;">${item.productName}</div>
                        <span class="text-danger fw-bold">${item.productPrice.toLocaleString()}원</span>
                    </div>
                `;
                btn.onclick = () => selectCoupangProduct(item.productShortenUrl);
                coupangList.appendChild(btn);
            });
        } else {
            coupangList.innerHTML = '<div class="text-muted p-3">검색 결과가 없습니다.</div>';
        }
    } catch (error) {
        if (error.message === "Unauthorized") return;
        coupangList.innerHTML = '<div class="text-danger p-3">쿠팡 연동 오류</div>';
    }
}

function selectCoupangProduct(url) {
    document.getElementById('selectedCoupangUrl').value = url;
    const items = document.querySelectorAll('#coupangList .list-group-item');
    items.forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// 4. 시트 업데이트
async function updateSheet() {
    const data = {
        link: currentLink,
        hook: document.getElementById('hookResult').value,
        caption: document.getElementById('captionResult').value,
        keywords: document.getElementById('keywordResult').value,
        coupangUrl: document.getElementById('selectedCoupangUrl').value
    };

    try {
        const result = await callGas('updateSheet', { data: data });
        if (result.status === "success") {
            alert("구글 시트에 성공적으로 저장되었습니다!");
        }
    } catch (error) {
        if (error.message === "Unauthorized") return;
        alert("시트 업데이트에 실패했습니다.");
    }
}

// 유틸리티: 복사 기능
function copyText(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    document.execCommand('copy');
    alert("복사되었습니다.");
}

// 유틸리티: 파일을 Base64로 변환
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            let base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}
