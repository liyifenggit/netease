// 酷狗音乐音源 - iOS JavaScriptCore 兼容版本
// 纯 ES5 语法，不使用解构赋值和混淆代码

// 音源信息
var sourceInfo = {
    id: 'kugou',
    name: '酷狗音乐',
    version: '1.0.0',
    author: 'Musical App',
    description: '酷狗音乐在线音源，支持搜索、播放、歌词',
    homepage: 'https://www.kugou.com',
    supportedTypes: ['song'],
    supportedQualities: ['standard', 'high', 'lossless']
};

// API 基础配置
var API_SEARCH = 'https://complexsearch.kugou.com/v2/search/song';
var API_MUSIC = 'https://wwwapi.kugou.com/yy/index.php';

// 获取用户Cookie（如果已登录）
function getKugouCookieIfAvailable() {
    try {
        if (typeof getKugouCookie === 'function') {
            var cookie = getKugouCookie();
            if (cookie && cookie.length > 0) {
                console.log(' [酷狗音乐] 使用登录Cookie');
                return cookie;
            }
        }
    } catch (error) {
        console.log(' [酷狗音乐] 获取Cookie失败: ' + error.message);
    }
    return '';
}

// 构建请求头（包含Cookie）
function buildKugouHeaders() {
    var headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.kugou.com/'
    };
    // 如果有Cookie，添加到请求头
    var cookie = getKugouCookieIfAvailable();
    if (cookie) {
        headers['Cookie'] = cookie;
    }
    return headers;
}

var API_LYRIC = 'https://krcs.kugou.com';

// 辅助函数：生成签名（酷狗API需要）
function generateSignature(params) {
    // 酷狗API的签名算法（简化版本）
    // 实际生产环境可能需要更复杂的加密
    var keys = Object.keys(params).sort();
    var signStr = '';
    for (var i = 0; i < keys.length; i++) {
        signStr += keys[i] + '=' + params[keys[i]];
    }
    return signStr;
}

// 搜索音乐
function search(keyword, page, type) {
    return new Promise(function(resolve, reject) {
        var limit = 50; // 增加到50首，提供更多搜索结果
        var offset = (page - 1) * limit;
        
        // 使用酷狗音乐搜索 API（使用songsearch端点，HTTPS）
        var url = 'https://songsearch.kugou.com/song_search_v2';
        var params = {
            keyword: keyword,
            page: page,
            pagesize: limit,
            userid: '-1',
            clientver: '',
            platform: 'WebFilter',
            tag: 'em',
            filter: '2',
            iscorrection: 1,
            privilege_filter: 0
        };
        
        // 构建查询字符串
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '?' + queryString;
        
        console.log('🔍 [酷狗音乐] 搜索: ' + keyword + ', 页码: ' + page);
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: buildKugouHeaders() // 包含Cookie
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                console.log('🔍 [酷狗音乐] API响应状态码: ' + (data.status || data.error_code || 'unknown'));
                
                // song_search_v2 API使用不同的响应格式
                if (!data.data || data.error_code) {
                    var errMsg = data.error_msg || data.errmsg || data.error || '搜索失败';
                    console.log('❌ [酷狗音乐] ' + errMsg);
                    reject(new Error(errMsg));
                    return;
                }
                
                var result = data.data;
                if (!result || !result.lists || result.lists.length === 0) {
                    console.log('⚠️ [酷狗音乐] 无搜索结果');
                    resolve({
                        list: [],
                        total: 0,
                        page: page,
                        hasMore: false
                    });
                    return;
                }
                
                var songList = result.lists;
                console.log('✅ [酷狗音乐] 找到 ' + songList.length + ' 首歌曲');
                
                // 转换歌曲列表
                var songs = songList.map(function(song) {
                    // 获取歌手名（去除HTML标签）
                    var artist = song.SingerName || song.singername || '未知歌手';
                    artist = artist.replace(/<em>|<\/em>/g, '');
                    
                    // 获取歌曲名（去除HTML标签）
                    var name = song.SongName || song.songname || '未知歌曲';
                    name = name.replace(/<em>|<\/em>/g, '');
                    
                    // 获取专辑名
                    var album = song.AlbumName || song.album_name || '未知专辑';
                    
                    // 获取封面
                    var picUrl = '';
                    if (song.album_id) {
                        // 酷狗封面URL格式
                        picUrl = 'https://imge.kugou.com/stdmusic/150/' + song.album_id + '.jpg';
                    }
                    
                    // 如果没有album_id，尝试使用歌手头像
                    if (!picUrl && song.SingerID) {
                        picUrl = 'https://imge.kugou.com/singerhead/150/' + song.SingerID + '.jpg';
                    }
                    
                    // 时长（秒）
                    var duration = song.Duration || 0;
                    
                    // 调试：打印封面 URL
                    if (picUrl) {
                        console.log('✅ 封面: ' + name + ' -> ' + picUrl);
                    } else {
                        console.log('⚠️ 无封面: ' + name + ' (专辑: ' + album + ')');
                    }
                    
                    return {
                        id: song.FileHash || song.hash || String(song.ID),
                        name: name,
                        artist: artist,
                        album: album,
                        duration: duration,
                        picUrl: picUrl,
                        metadata: {
                            albumId: song.album_id || song.AlbumID || '',
                            mvHash: song.MvHash || '',
                            fileSize: song.FileSize || 0,
                            sqFileHash: song.SQFileHash || song.HQFileHash || '' // 高品质hash
                        }
                    };
                });
                
                var total = result.total || songs.length;
                var hasMore = (offset + songs.length) < total;
                
                resolve({
                    list: songs,
                    total: total,
                    page: page,
                    hasMore: hasMore
                });
                
            } catch (error) {
                reject(new Error('解析搜索结果失败: ' + error.message));
            }
        }).catch(function(error) {
            reject(new Error('网络请求失败: ' + error.message));
        });
    });
}

// 获取播放 URL
function getMusicUrl(songInfo, quality) {
    return new Promise(function(resolve, reject) {
        var hash = songInfo.id;
        
        console.log('🔍 [酷狗音乐] getMusicUrl - hash: ' + hash);
        console.log('🔍 [酷狗音乐] 歌曲: ' + (songInfo.name || '未知'));
        console.log('🔍 [酷狗音乐] 音质: ' + quality);
        
        // 根据音质选择对应的hash
        var fileHash = hash;
        if (quality === 'high' && songInfo.metadata && songInfo.metadata.sqFileHash) {
            fileHash = songInfo.metadata.sqFileHash;
        }
        
        // 使用酷狗移动端API（更简单，无需复杂验证）
        var url = 'https://m.kugou.com/app/i/getSongInfo.php';
        var params = {
            cmd: 'playInfo',
            hash: fileHash
        };
        
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '?' + queryString;
        
        console.log('🔗 [酷狗音乐] 请求URL: ' + fullUrl.substring(0, 100) + '...');
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: buildKugouHeaders() // 包含Cookie
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                console.log('🔍 [酷狗音乐] API响应状态: ' + (data.status || data.errcode || 'unknown'));
                
                // 移动端API使用不同的响应格式
                // 成功: status=1 或 errcode=0
                // 失败: status=0 或 errcode!=0
                var isSuccess = (data.status === 1 || data.errcode === 0);
                
                if (!isSuccess) {
                    var errMsg = data.error || data.errmsg || data.err_msg || '获取播放链接失败';
                    console.log('❌ [酷狗音乐] 错误: ' + errMsg);
                    console.log('   响应详情: ' + JSON.stringify(data).substring(0, 300));
                    reject(new Error(errMsg));
                    return;
                }
                
                // 移动端API响应格式: data直接包含url字段
                var playUrl = data.url || (data.data && data.data.play_url) || '';
                
                if (!playUrl) {
                    console.log('❌ [酷狗音乐] 未找到播放URL');
                    console.log('   响应数据: ' + JSON.stringify(data).substring(0, 300));
                    reject(new Error('该歌曲暂无版权或无法播放'));
                    return;
                }
                
                // iOS ATS要求使用HTTPS，强制转换HTTP为HTTPS
                if (playUrl.indexOf('http://') === 0) {
                    playUrl = playUrl.replace('http://', 'https://');
                    console.log('🔒 [酷狗音乐] 已将HTTP转换为HTTPS以符合ATS要求');
                }
                
                // 判断格式
                var format = 'mp3';
                if (playUrl) {
                    var urlLower = playUrl.toLowerCase();
                    if (urlLower.indexOf('.flac') > -1) {
                        format = 'flac';
                    } else if (urlLower.indexOf('.ape') > -1) {
                        format = 'ape';
                    } else if (urlLower.indexOf('.m4a') > -1) {
                        format = 'm4a';
                    }
                }
                
                // 从响应中获取音质和文件信息
                var bitrate = data.bitrate || (data.data && data.data.bitrate) || 128;
                var filesize = data.filesize || (data.data && data.data.filesize) || 0;
                
                // 判断实际音质
                var actualQuality = quality;
                if (bitrate) {
                    var br = parseInt(bitrate);
                    if (br >= 900) {
                        actualQuality = 'lossless';
                    } else if (br >= 300) {
                        actualQuality = 'high';
                    } else {
                        actualQuality = 'standard';
                    }
                }
                
                console.log('✅ [酷狗音乐] 播放URL获取成功');
                console.log('   格式: ' + format + ', 音质: ' + actualQuality);
                console.log('   URL: ' + playUrl.substring(0, 80) + '...');
                
                resolve({
                    url: playUrl,
                    quality: actualQuality,
                    format: format,
                    size: filesize,
                    br: bitrate ? parseInt(bitrate) * 1000 : 128000,
                    expiresIn: 3600 // 1小时
                });
                
            } catch (error) {
                console.log('❌ [酷狗音乐] 解析失败: ' + error.message);
                reject(new Error('解析播放链接失败: ' + error.message));
            }
        }).catch(function(error) {
            console.log('❌ [酷狗音乐] 网络请求失败: ' + error.message);
            reject(new Error('网络请求失败: ' + error.message));
        });
    });
}

// 获取歌词
function getLyric(songInfo) {
    return new Promise(function(resolve, reject) {
        var hash = songInfo.id;
        
        // 第一步：获取歌词ID和accesskey
        var url = API_MUSIC + '?r=play/getdata';
        var params = {
            hash: hash
        };
        
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '&' + queryString;
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: buildKugouHeaders() // 包含Cookie
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                if (data.err_code !== 0 || !data.data) {
                    resolve({
                        lyric: '[00:00.00]暂无歌词',
                        translatedLyric: null
                    });
                    return;
                }
                
                var audioInfo = data.data;
                var lyricsId = audioInfo.lyrics_id;
                
                if (!lyricsId) {
                    resolve({
                        lyric: '[00:00.00]暂无歌词',
                        translatedLyric: null
                    });
                    return;
                }
                
                // 第二步：获取歌词内容
                var lyricUrl = API_LYRIC + '/search';
                var lyricParams = {
                    ver: '1',
                    man: 'yes',
                    client: 'mobi',
                    keyword: '%20-%20',
                    duration: songInfo.duration || '',
                    hash: hash,
                    timelength: (songInfo.duration || 0) * 1000
                };
                
                var lyricQueryString = Object.keys(lyricParams).map(function(key) {
                    return encodeURIComponent(key) + '=' + encodeURIComponent(lyricParams[key]);
                }).join('&');
                
                var lyricFullUrl = lyricUrl + '?' + lyricQueryString;
                
                httpRequest(lyricFullUrl, {
                    method: 'GET',
                    headers: buildKugouHeaders() // 包含Cookie
                }).then(function(lyricResponse) {
                    try {
                        var lyricData = JSON.parse(lyricResponse.body);
                        
                        if (lyricData.status !== 200 || !lyricData.candidates || lyricData.candidates.length === 0) {
                            resolve({
                                lyric: '[00:00.00]暂无歌词',
                                translatedLyric: null
                            });
                            return;
                        }
                        
                        var candidate = lyricData.candidates[0];
                        var accesskey = candidate.accesskey;
                        var id = candidate.id;
                        
                        // 第三步：下载歌词文件
                        var downloadUrl = API_LYRIC + '/download';
                        var downloadParams = {
                            ver: '1',
                            client: 'pc',
                            id: id,
                            accesskey: accesskey,
                            fmt: 'lrc',
                            charset: 'utf8'
                        };
                        
                        var downloadQueryString = Object.keys(downloadParams).map(function(key) {
                            return encodeURIComponent(key) + '=' + encodeURIComponent(downloadParams[key]);
                        }).join('&');
                        
                        var downloadFullUrl = downloadUrl + '?' + downloadQueryString;
                        
                        httpRequest(downloadFullUrl, {
                            method: 'GET',
                            headers: buildKugouHeaders() // 包含Cookie
                        }).then(function(downloadResponse) {
                            try {
                                var finalData = JSON.parse(downloadResponse.body);
                                
                                if (finalData.status !== 200 || !finalData.content) {
                                    resolve({
                                        lyric: '[00:00.00]暂无歌词',
                                        translatedLyric: null
                                    });
                                    return;
                                }
                                
                                // 解码Base64歌词
                                var lyricContent = decodeBase64(finalData.content);
                                
                                if (!lyricContent) {
                                    lyricContent = '[00:00.00]暂无歌词';
                                }
                                
                                resolve({
                                    lyric: lyricContent,
                                    translatedLyric: null // 酷狗通常不提供翻译歌词
                                });
                                
                            } catch (error) {
                                resolve({
                                    lyric: '[00:00.00]暂无歌词',
                                    translatedLyric: null
                                });
                            }
                        }).catch(function() {
                            resolve({
                                lyric: '[00:00.00]暂无歌词',
                                translatedLyric: null
                            });
                        });
                        
                    } catch (error) {
                        resolve({
                            lyric: '[00:00.00]暂无歌词',
                            translatedLyric: null
                        });
                    }
                }).catch(function() {
                    resolve({
                        lyric: '[00:00.00]暂无歌词',
                        translatedLyric: null
                    });
                });
                
            } catch (error) {
                resolve({
                    lyric: '[00:00.00]暂无歌词',
                    translatedLyric: null
                });
            }
        }).catch(function() {
            resolve({
                lyric: '[00:00.00]暂无歌词',
                translatedLyric: null
            });
        });
    });
}

// 可选：获取封面 URL
function getPicUrl(songInfo, size) {
    return new Promise(function(resolve) {
        var picUrl = songInfo.picUrl || '';
        
        if (!picUrl) {
            resolve('');
            return;
        }
        
        // 酷狗图片支持尺寸调整（替换URL中的尺寸参数）
        var sizeParam = '150';
        if (size === 'small') {
            sizeParam = '150';
        } else if (size === 'medium') {
            sizeParam = '400';
        } else if (size === 'large') {
            sizeParam = '800';
        }
        
        // 替换URL中的尺寸
        picUrl = picUrl.replace(/\/\d+\//, '/' + sizeParam + '/');
        
        resolve(picUrl);
    });
}

// 辅助函数：生成mid
function generateMid() {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    var mid = '';
    for (var i = 0; i < 32; i++) {
        mid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return mid;
}

// 辅助函数：Base64解码（简化版）
function decodeBase64(str) {
    try {
        // 在iOS环境中，可以使用atob
        if (typeof atob !== 'undefined') {
            return atob(str);
        }
        // 否则返回原字符串
        return str;
    } catch (e) {
        return str;
    }
}

console.log('✅ 酷狗音乐音源加载成功！');
