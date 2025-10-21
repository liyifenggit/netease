// 网易云音乐音源 - iOS JavaScriptCore 兼容版本
// 纯 ES5 语法，不使用解构赋值和混淆代码

// 音源信息
var sourceInfo = {
    id: 'netease',
    name: '网易云音乐',
    version: '1.0.0',
    author: 'Musical App',
    description: '网易云音乐在线音源，支持搜索、播放、歌词',
    homepage: 'https://music.163.com',
    supportedTypes: ['song'],
    supportedQualities: ['standard', 'high', 'lossless']
};

// API 基础配置
var API_BASE = 'https://music.163.com/api';
var API_WEAPI = 'https://music.163.com/weapi';

// 搜索音乐
function search(keyword, page, type) {
    return new Promise(function(resolve, reject) {
        var limit = 30;
        var offset = (page - 1) * limit;
        
        // 使用网易云搜索 API
        var url = API_BASE + '/search/get/web';
        var params = {
            s: keyword,
            type: 1, // 1=歌曲
            limit: limit,
            offset: offset
        };
        
        // 构建查询字符串
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '?' + queryString;
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://music.163.com',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                if (data.code !== 200) {
                    reject(new Error('搜索失败: ' + (data.message || '未知错误')));
                    return;
                }
                
                var result = data.result;
                if (!result || !result.songs) {
                    resolve({
                        list: [],
                        total: 0,
                        page: page,
                        hasMore: false
                    });
                    return;
                }
                
                // 转换歌曲列表
                var songs = result.songs.map(function(song) {
                    // 获取歌手名
                    var artists = song.artists || [];
                    var artistNames = artists.map(function(ar) {
                        return ar.name;
                    });
                    var artist = artistNames.join(' / ') || '未知歌手';
                    
                    // 获取专辑名
                    var album = (song.album && song.album.name) || '未知专辑';
                    
                    // 获取封面（优先级：album.picUrl > album.blurPicUrl > 专辑详情API > 歌手头像）
                    var picUrl = '';
                    if (song.album) {
                        picUrl = song.album.picUrl || song.album.blurPicUrl || song.album.pic_str || '';
                        
                        // 如果专辑封面为空但有专辑ID，可以后续调用专辑详情API获取
                        // 专辑详情API: https://music.163.com/api/album/{albumId}
                        // 但这会增加额外的网络请求，暂不实现
                        // 留待播放时或下载时按需获取
                    }
                    
                    // 如果专辑封面为空，尝试使用歌手头像
                    if (!picUrl && artists.length > 0) {
                        picUrl = artists[0].picUrl || artists[0].img1v1Url || '';
                    }
                    
                    // 调试：打印封面 URL
                    if (picUrl) {
                        console.log('✅ 封面: ' + song.name + ' -> ' + picUrl);
                    } else {
                        console.log('⚠️ 无封面: ' + song.name + ' (专辑: ' + album + ')');
                    }
                    
                    // 时长（毫秒转秒）
                    var duration = song.duration ? song.duration / 1000 : 0;
                    
                    return {
                        id: String(song.id),
                        name: song.name || '未知歌曲',
                        artist: artist,
                        album: album,
                        duration: duration,
                        picUrl: picUrl,
                        metadata: {
                            mvId: song.mvid ? String(song.mvid) : '',
                            alias: song.alias ? song.alias.join(' / ') : ''
                        }
                    };
                });
                
                var total = result.songCount || songs.length;
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
        var songId = songInfo.id;
        
        // 根据音质选择比特率
        var br = 128000; // 标准
        if (quality === 'high') {
            br = 320000;
        } else if (quality === 'lossless') {
            br = 999000;
        }
        
        // 使用网易云获取歌曲 URL API
        var url = API_BASE + '/song/enhance/player/url';
        var params = {
            ids: '[' + songId + ']',
            br: br
        };
        
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '?' + queryString;
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://music.163.com'
            }
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                if (data.code !== 200) {
                    reject(new Error('获取播放链接失败: ' + (data.message || '未知错误')));
                    return;
                }
                
                var songs = data.data;
                if (!songs || songs.length === 0) {
                    reject(new Error('该歌曲暂无版权或无法播放'));
                    return;
                }
                
                var song = songs[0];
                if (!song.url) {
                    reject(new Error('该歌曲暂无版权或无法播放'));
                    return;
                }
                
                // 判断实际音质
                var actualQuality = quality;
                if (song.br) {
                    if (song.br >= 900000) {
                        actualQuality = 'lossless';
                    } else if (song.br >= 300000) {
                        actualQuality = 'high';
                    } else {
                        actualQuality = 'standard';
                    }
                }
                
                // 判断格式
                var format = 'mp3';
                if (song.type) {
                    format = song.type.toLowerCase();
                }
                
                resolve({
                    url: song.url,
                    quality: actualQuality,
                    format: format,
                    size: song.size || 0,
                    br: song.br || br,
                    expiresIn: 3600 // 1小时
                });
                
            } catch (error) {
                reject(new Error('解析播放链接失败: ' + error.message));
            }
        }).catch(function(error) {
            reject(new Error('网络请求失败: ' + error.message));
        });
    });
}

// 获取歌词
function getLyric(songInfo) {
    return new Promise(function(resolve, reject) {
        var songId = songInfo.id;
        
        var url = API_BASE + '/song/lyric';
        var params = {
            id: songId,
            lv: -1,
            tv: -1
        };
        
        var queryString = Object.keys(params).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');
        
        var fullUrl = url + '?' + queryString;
        
        httpRequest(fullUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://music.163.com'
            }
        }).then(function(response) {
            try {
                var data = JSON.parse(response.body);
                
                if (data.code !== 200) {
                    reject(new Error('获取歌词失败: ' + (data.message || '未知错误')));
                    return;
                }
                
                var lyric = '';
                var translatedLyric = null;
                
                // 原文歌词
                if (data.lrc && data.lrc.lyric) {
                    lyric = data.lrc.lyric;
                }
                
                // 翻译歌词
                if (data.tlyric && data.tlyric.lyric) {
                    translatedLyric = data.tlyric.lyric;
                }
                
                if (!lyric) {
                    lyric = '[00:00.00]暂无歌词';
                }
                
                resolve({
                    lyric: lyric,
                    translatedLyric: translatedLyric
                });
                
            } catch (error) {
                reject(new Error('解析歌词失败: ' + error.message));
            }
        }).catch(function(error) {
            reject(new Error('网络请求失败: ' + error.message));
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
        
        // 网易云图片支持参数调整大小
        var sizeParam = '';
        if (size === 'small') {
            sizeParam = '?param=200y200';
        } else if (size === 'medium') {
            sizeParam = '?param=400y400';
        } else if (size === 'large') {
            sizeParam = '?param=800y800';
        }
        
        resolve(picUrl + sizeParam);
    });
}

console.log('✅ 网易云音乐音源加载成功！');
