# 업로드 제한
- 재생 시간이 90분 이상이거나, 파일 크기가 1GB 이상일 때

# 유튜브 다운로드 방법 - 터미널에서 다음 명령어 실행
- ytrep <URL>                 # 720p H.264+AAC MP4 + .srt → ~/Downloads/repeater
- ytrep -p <재생목록 URL>       # 재생목록 전체를 "001 - 제목.mp4" 형태로 폴더 하나에
- ytrep -q 1080 <URL>         # 해상도 상한 변경
- ytrep -o ~/dir <URL>        # 저장 위치 변경
- ytrep -c <URL>              # Chrome 쿠키 사용 (로그인/연령 제한, 429 완화)
