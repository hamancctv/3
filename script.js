document.addEventListener('DOMContentLoaded', () => {
    // 모든 변수 및 함수 선언
    const container = document.getElementById('container');
    const mapContainer = document.getElementById('map');
    const rvContainer = document.getElementById('roadview');
    const keywordInput = document.getElementById('keyword');
    const gpsyxInput = document.getElementById('gpsyx');
    const btnDistance = document.getElementById('btnDistance');
    const closeBtn = document.getElementById('close');
    const roadviewControl = document.getElementById('roadviewControl');
    const searchBtn = document.getElementById('searchBtn');
    const btnInputCopy = document.getElementById('btn_input_copy');
    const btnCurrentMe = document.getElementById('btnCurrentMe');
    const btnTrackMe = document.getElementById('btnTrackMe');
    const toggleGroupBtn = document.getElementById('toggle_group');
    const menuWrap = document.getElementById('menu_wrap');

    const mapCenter = new kakao.maps.LatLng(35.2725308711779, 128.406307024695);
    const mapOption = {
        center: mapCenter,
        level: 4,
    };
    
    // 지도, 로드뷰 객체 생성
    const map = new kakao.maps.Map(mapContainer, mapOption);
    map.setMaxLevel(9);
    const rv = new kakao.maps.Roadview(rvContainer);
    const rvClient = new kakao.maps.RoadviewClient();
    const geocoder = new kakao.maps.services.Geocoder();
    const ps = new kakao.maps.services.Places();

    // 전역 상태 변수
    let overlayOn = false;
    let myLocationOn = false;
    let trackOn = false;
    let myLocationMarker = null;
    let trackMarker = null;
    let watchId = null;
    let drawing = false;
    let currentGroup = null;
    let groups = [];
    let tempLine = null;
    let searchFailCount = 0;
    const allLines = [];
    let clickedOverlay = null;

    // 마커 이미지 및 객체
    const roadviewMarkImage = new kakao.maps.MarkerImage(
        'https://t1.daumcdn.net/localimg/localimages/07/2018/pc/roadview_minimap_wk_2018.png',
        new kakao.maps.Size(26, 46),
        {
            spriteSize: new kakao.maps.Size(1666, 168),
            spriteOrigin: new kakao.maps.Point(705, 114),
            offset: new kakao.maps.Point(13, 46)
        }
    );
    const myLocationMarkImage = new kakao.maps.MarkerImage(
        'https://hamancctv.github.io/5/icon-target.png',
        new kakao.maps.Size(32, 32),
        { offset: new kakao.maps.Point(16, 16) }
    );
    const marker = new kakao.maps.Marker({
        image: roadviewMarkImage,
        position: mapCenter,
        draggable: true
    });

    // `sel_txt.html` 파일 로딩
    fetch("https://raw.githubusercontent.com/hamancctv/5/refs/heads/main/sel_txt.html")
        .then(response => response.text())
        .then(html => {
            menuWrap.innerHTML = html;
            // `sel_txt.html` 로드 후 필터링 기능 활성화
            keywordInput.addEventListener('keyup', filter);
        })
        .catch(err => console.error("메뉴 로드 실패:", err));

    // 마커, 클러스터러, 오버레이 생성
    const unique = {};
    const filteredPositions = positions.filter(pos => {
        const key = `${pos.latlng.getLat()},${pos.latlng.getLng()}`;
        if (unique[key]) return false;
        unique[key] = true;
        return true;
    });

    const markers = [];
    const overlays = [];
    for (const pos of filteredPositions) {
        const marker2 = new kakao.maps.Marker({
            position: pos.latlng,
            image: pos.markerImage,
            clickable: true
        });

        marker2.group = pos.group;
        
        kakao.maps.event.addListener(marker2, 'click', () => {
            if (clickedOverlay) clickedOverlay.setMap(null);
            const newOverlay = new kakao.maps.CustomOverlay({
                position: pos.latlng,
                content: `<div style="padding:5px 8px; background:rgba(255,255,255,0.95); border:1px solid #666; border-radius:5px; font-size:13px; white-space: nowrap; transform: translateY(-42px); user-select: none;">${pos.content}</div>`,
                yAnchor: 1,
                map: map,
                clickable: false
            });
            clickedOverlay = newOverlay;
            gpsyxInput.value = `${pos.latlng.getLat()}, ${pos.latlng.getLng()}`;
        });

        const hoverOverlay = new kakao.maps.CustomOverlay({
            position: pos.latlng,
            content: `<div style="padding:2px 6px; background:rgba(255,255,255,0.9); border:1px solid #ccc; border-radius:5px; font-size:12px; white-space: nowrap; transform: translateY(-42px); user-select: none;">${pos.content}</div>`,
            yAnchor: 1,
            map: null,
            clickable: false
        });
        
        kakao.maps.event.addListener(marker2, 'mouseover', () => {
            if (map.getLevel() > 3) hoverOverlay.setMap(map);
        });
        kakao.maps.event.addListener(marker2, 'mouseout', () => {
            hoverOverlay.setMap(null);
        });

        markers.push(marker2);
        overlays.push(hoverOverlay);
    }
    
    const markerClusterer = new kakao.maps.MarkerClusterer({
        map: map,
        averageCenter: true,
        minLevel: 5,
        styles: [{ width: '40px', height: '40px', background: '#3F992E', color: '#fff', textAlign: 'center', lineHeight: '40px', borderRadius: '50%', border: '1px solid #2e7a22' }, { width: '50px', height: '50px', background: '#2B6A20', color: '#fff', textAlign: 'center', lineHeight: '50px', borderRadius: '50%', border: '1px solid #1e4a16' }]
    });
    markerClusterer.addMarkers(markers);
    
    // --- 이벤트 리스너 ---

    // 로드뷰 및 지도 이벤트 리스너
    kakao.maps.event.addListener(rv, 'position_changed', () => {
        const rvPosition = rv.getPosition();
        map.setCenter(rvPosition);
        if (overlayOn) {
            marker.setPosition(rvPosition);
        }
    });

    kakao.maps.event.addListener(marker, 'dragend', (mouseEvent) => {
        const position = marker.getPosition();
        toggleRoadview(position);
    });

    kakao.maps.event.addListener(map, 'click', (mouseEvent) => {
        if (drawing) return;
        if (overlayOn) {
            const position = mouseEvent.latLng;
            marker.setPosition(position);
            toggleRoadview(position);
            return;
        }
        const latlng = mouseEvent.latLng;
        gpsyxInput.value = `${latlng.getLat()}, ${latlng.getLng()}`;
    });

    kakao.maps.event.addListener(map, 'center_changed', () => {
        const latlng = map.getCenter();
        gpsyxInput.value = `${latlng.getLat()}, ${latlng.getLng()}`;
    });

    kakao.maps.event.addListener(map, 'idle', () => {
        const level = map.getLevel();
        overlays.forEach(o => {
            if (level <= 3) o.setMap(map);
            else o.setMap(null);
        });
    });

    // UI 버튼 이벤트 리스너
    roadviewControl.addEventListener('click', setRoadviewRoad);
    closeBtn.addEventListener('click', closeRoadview);
    btnCurrentMe.addEventListener('click', toggleMyLocation);
    btnTrackMe.addEventListener('click', toggleTracking);
    btnDistance.addEventListener('click', handleDistanceClickEvent);
    searchBtn.addEventListener('click', btnsearch_click);
    keywordInput.addEventListener('keydown', (e) => {
        if (e.keyCode === 13) btnsearch_click();
    });
    btnInputCopy.addEventListener('click', () => {
        gpsyxInput.select();
        document.execCommand('copy');
    });
    toggleGroupBtn.addEventListener('click', () => {
        drawGroupLinesMST();
        toggleGroupBtn.classList.toggle('selected_btn');
    });


    // --- 함수 정의 ---
    function toggleRoadview(position) {
        rvClient.getNearestPanoId(position, 50, (panoId) => {
            if (panoId === null) {
                toggleMapWrapper(true, position);
            } else {
                toggleMapWrapper(false, position);
                rv.setPanoId(panoId, position);
            }
        });
    }

    function toggleMapWrapper(active, position) {
        if (active) {
            container.className = '';
        } else {
            if (container.className.indexOf('view_roadview') === -1) {
                container.className = 'view_roadview';
            }
        }
        map.relayout();
        map.setCenter(position);
    }

    function toggleOverlay(active) {
        if (active) {
            overlayOn = true;
            map.addOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW);
            marker.setMap(map);
            markerClusterer.removeMarkers(markers);
            marker.setPosition(map.getCenter());
            toggleRoadview(map.getCenter());
        } else {
            overlayOn = false;
            map.removeOverlayMapTypeId(kakao.maps.MapTypeId.ROADVIEW);
            marker.setMap(null);
            markerClusterer.addMarkers(markers);
        }
    }

    function setRoadviewRoad() {
        if (roadviewControl.className.indexOf('active') === -1) {
            roadviewControl.className = 'active';
            toggleOverlay(true);
        } else {
            roadviewControl.className = '';
            toggleOverlay(false);
        }
    }

    function closeRoadview() {
        const position = marker.getPosition();
        toggleMapWrapper(true, position);
    }

    function toggleMyLocation() {
        if (trackOn) stopTracking();
        myLocationOn = !myLocationOn;
        btnCurrentMe.classList.toggle('selected_btn', myLocationOn);
        if (myLocationOn) {
            navigator.geolocation.getCurrentPosition(showMyLocation, geoError, { enableHighAccuracy: true });
        } else {
            if (myLocationMarker) {
                myLocationMarker.setMap(null);
                myLocationMarker = null;
            }
        }
    }

    function showMyLocation(pos) {
        const latLng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        if (!myLocationMarker) {
            myLocationMarker = new kakao.maps.Marker({ position: latLng, map: map, image: myLocationMarkImage });
            kakao.maps.event.addListener(myLocationMarker, 'click', () => {
                map.panTo(myLocationMarker.getPosition());
                map.setLevel(4);
            });
        } else {
            myLocationMarker.setPosition(latLng);
            myLocationMarker.setMap(map);
        }
        map.panTo(latLng);
        map.setLevel(5);
    }

    function toggleTracking() {
        if (myLocationOn) toggleMyLocation();
        trackOn ? stopTracking() : startTracking();
    }

    function startTracking() {
        trackOn = true;
        btnTrackMe.classList.add('selected_btn');
        watchId = navigator.geolocation.watchPosition((pos) => {
            const latLng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if (!trackMarker) {
                trackMarker = new kakao.maps.Marker({ position: latLng, map: map, image: myLocationMarkImage });
            } else {
                trackMarker.setPosition(latLng);
                trackMarker.setMap(map);
            }
            map.panTo(latLng);
        }, geoError, { enableHighAccuracy: true });

        trackInterval = setInterval(() => {
            if (trackMarker) trackMarker.setVisible(!trackMarker.getVisible());
        }, 500);
    }

    function stopTracking() {
        trackOn = false;
        btnTrackMe.classList.remove('selected_btn');
        if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        if (trackInterval) { clearInterval(trackInterval); trackInterval = null; }
        if (trackMarker) { trackMarker.setVisible(true); trackMarker.setMap(null); trackMarker = null; }
    }

    function geoError(err) { console.error('GPS error:', err); }

    function btnsearch_click() {
        document.activeElement.blur();
        const bounds = new kakao.maps.LatLngBounds( new kakao.maps.LatLng(35.119382493091855, 128.18218076324376), new kakao.maps.LatLng(35.42383291087308, 128.59320201946082) );
        const geocoderOptions = { bounds: bounds };
        const psOptions = { bounds: bounds };

        geocoder.addressSearch(keywordInput.value, (result, status) => {
            handleSearchResult(result, status, 'address');
        }, geocoderOptions);

        ps.keywordSearch(`함안군 ${keywordInput.value}`, (data, status) => {
            handleSearchResult(data, status, 'keyword');
        }, psOptions);

        searchFailCount = 0;
    }

    function handleSearchResult(data, status, searchType) {
        if (status === kakao.maps.services.Status.OK && data.length > 0) {
            const coords = new kakao.maps.LatLng(data[0].y, data[0].x);
            const circle = new kakao.maps.Circle({ center: coords, radius: 50, strokeWeight: 1, strokeColor: '#ffa500', strokeOpacity: 1, strokeStyle: 'dashed', fillColor: '#FF1000', fillOpacity: 0.3 });
            circle.setMap(map);
            setTimeout(() => circle.setMap(null), 1000);
            map.setLevel(2);
            map.setCenter(coords);
            searchFailCount = 0;
        } else {
            searchFailCount++;
            if (searchFailCount >= 2) {
                showAlert("검색 결과가 없습니다.");
                keywordInput.focus();
            }
        }
    }
    
    function showAlert(message) {
        const alertOverlay = document.getElementById('alert-overlay');
        const alertMessage = document.getElementById('alert-message');
        alertMessage.innerText = message;
        alertOverlay.style.display = 'block';
        setTimeout(() => alertOverlay.style.display = 'none', 3000);
    }

    function resetAll() {
        if (tempLine) { tempLine.setMap(null); tempLine = null; }
        groups.forEach(group => {
            group.polylines.forEach(l => l.setMap(null));
            group.overlays.forEach(o => o.setMap(null));
        });
        groups = [];
        currentGroup = null;
    }

    function startNewGroup() {
        currentGroup = { path: [], polylines: [], overlays: [] };
        groups.push(currentGroup);
    }

    function addLabel(group, position, text) {
        const content = document.createElement('div');
        content.className = 'labelBox';
        content.innerText = text;
        const overlay = new kakao.maps.CustomOverlay({ content: content, position: position, yAnchor: 1.5 });
        overlay.setMap(map);
        group.overlays.push(overlay);
    }

    function handleDistanceClickEvent() {
        drawing = !drawing;
        if (drawing) {
            resetAll();
            startNewGroup();
            map.setCursor('crosshair');
            btnDistance.classList.add('active');
            kakao.maps.event.addListener(map, 'click', handleDistanceClick);
            kakao.maps.event.addListener(map, 'mousemove', handleDistanceMove);
        } else {
            resetAll();
            map.setCursor('');
            btnDistance.classList.remove('active');
            kakao.maps.event.removeListener(map, 'click', handleDistanceClick);
            kakao.maps.event.removeListener(map, 'mousemove', handleDistanceMove);
        }
    }

    function handleDistanceClick(mouseEvent) {
        if (!currentGroup) return;
        const clickPos = mouseEvent.latLng;
        currentGroup.path.push(clickPos);
        if (currentGroup.path.length > 1) {
            const path = [currentGroup.path[currentGroup.path.length-2], clickPos];
            const polyline = new kakao.maps.Polyline({ map: map, path: path, strokeWeight: 3, strokeColor: '#db4040', strokeOpacity: 1, strokeStyle: 'solid' });
            currentGroup.polylines.push(polyline);
            const segDist = polyline.getLength();
            addLabel(currentGroup, clickPos, `${segDist.toFixed(1)} m`);
        }
    }
    
    function handleDistanceMove(mouseEvent) {
        if (!currentGroup || currentGroup.path.length === 0) return;
        const movePos = mouseEvent.latLng;
        if (!tempLine) {
            tempLine = new kakao.maps.Polyline({ map: map, strokeWeight: 2, strokeColor: '#999', strokeOpacity: 0.8, strokeStyle: 'dash' });
        }
        tempLine.setPath([currentGroup.path[currentGroup.path.length-1], movePos]);
    }
    
    function filter() {
        const value = keywordInput.value.toUpperCase();
        const items = document.getElementsByClassName("sel_txt");
        for(let i=0; i<items.length; i++){
            const name = items[i].getElementsByClassName("name")[0];
            items[i].style.display = (name && name.innerText.toUpperCase().indexOf(value) > -1) ? "flex" : "none";
        }
    }
    
    function drawGroupLinesMST() {
        if (allLines.length > 0) {
            allLines.forEach(l => l.setMap(null));
            allLines.length = 0;
            return;
        }
        const groupMarkers = {};
        markers.forEach(m => {
            const group = m.group;
            if (!group) return;
            if (!groupMarkers[group]) groupMarkers[group] = [];
            groupMarkers[group].push(m);
        });

        for (const g in groupMarkers) {
            const group = groupMarkers[g];
            if (group.length < 2) continue;
            const n = group.length;
            const selected = Array(n).fill(false);
            const dist = Array(n).fill(Infinity);
            const parent = Array(n).fill(-1);
            dist[0] = 0;

            for (let k = 0; k < n; k++) {
                let u = -1;
                for (let i = 0; i < n; i++) {
                    if (!selected[i] && (u === -1 || dist[i] < dist[u])) u = i;
                }
                selected[u] = true;
                for (let v = 0; v < n; v++) {
                    if (!selected[v]) {
                        const d = getDistance(group[u].getPosition(), group[v].getPosition());
                        if (d < dist[v]) { dist[v] = d; parent[v] = u; }
                    }
                }
            }

            for (let i = 1; i < n; i++) {
                const path = [group[i].getPosition(), group[parent[i]].getPosition()];
                const line = new kakao.maps.Polyline({ path: path, strokeWeight: 3, strokeColor: '#FF5C5C', strokeOpacity: 0.7 });
                line.setMap(map);
                allLines.push(line);
            }
        }
    }

    function getDistance(latlng1, latlng2) {
        const R = 6371e3;
        const lat1 = latlng1.getLat() * Math.PI / 180;
        const lat2 = latlng2.getLat() * Math.PI / 180;
        const dLat = (latlng2.getLat() - latlng1.getLat()) * Math.PI / 180;
        const dLng = (latlng2.getLng() - latlng1.getLng()) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
});
