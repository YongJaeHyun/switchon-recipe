const isCompletedHangul = (str: string) => /^[가-힣]+$/.test(str); // 완성형 한글만 있는지 체크

export { isCompletedHangul };
