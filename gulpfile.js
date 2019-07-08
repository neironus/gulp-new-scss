'use strict';

const fs = require('fs');
const gulp = require('gulp');
const browserSync = require('browser-sync').create();
const realFavicon = require ('gulp-real-favicon');

const postcss = require('gulp-postcss');
const autoprefixer = require("autoprefixer");
const mqpacker = require("css-mqpacker");
const atImport = require("postcss-import");
const cleanss = require('gulp-clean-css');
const inlineSVG = require('postcss-inline-svg');
const objectFitImages = require('postcss-object-fit-images');
const cssbeautify = require('gulp-cssbeautify');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const gulpIf = require('gulp-if');
const debug = require('gulp-debug');
const rename = require('gulp-rename');
const size = require('gulp-size');
const del = require('del');
const newer = require('gulp-newer');
const webp = require('gulp-webp');
const imageminWebp = require('imagemin-webp');
const embedSvg = require('gulp-embed-svg');

// Файл с настройками фавиконок
const faviconData = './faviconData.json';
// Получение настроек проекта из config.json
let projectConfig = require('./config.json');
let dirs = projectConfig.dirs;
let lists = getFilesList(projectConfig);

// Получение адреса репозитория
let repoUrl = require('./package.json').repository.url.replace(/\.git$/g, '');
console.log(repoUrl);

// Определение: разработка это или финальная сборка
// Запуск `NODE_ENV=prod npm start [задача]` приведет к сборке без sourcemaps
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV == 'dev';

let postCssPlugins = [
    autoprefixer(), // настройки вынесены в package.json, дабы получать их для любой задачи
    mqpacker({
        sort:false
    }),
    atImport(),
    inlineSVG(),
    objectFitImages()
];

// Очистка папки сборки
gulp.task('clean', function () {
    console.log('---------- Очистка папки сборки');

    return del([
        dirs.buildPath + '/**/*',
        '!' + dirs.buildPath + '/readme.md'
    ]);
});

// Компиляция sass стилей проекта
gulp.task('sass', function () {
    const sass = require('gulp-sass');
    const sourcemaps = require('gulp-sourcemaps');
    const wait = require('gulp-wait');
    const insert = require('gulp-insert');

    console.log('---------- Компиляция стилей');

    return gulp.src(dirs.cssPath + 'sass/styles.scss')
        .pipe(plumber({
            errorHandler: function (err) {
                notify.onError({
                    title: 'SASS compilation error',
                    message: err.message
                })(err);
                this.emit('end');
            }
        }))
        .pipe(wait(100))
        .pipe(gulpIf(isDev, sourcemaps.init()))
        .pipe(debug({
            title: 'Style:'
        }))
        .pipe(sass({
            includePaths: [__dirname + '/']
        }))
        .pipe(postcss(postCssPlugins))
        .pipe(gulpIf(!isDev, cleanss()))
        .pipe(gulpIf(isDev, cssbeautify({
            autosemicolon: true
        })))
        .pipe(gulpIf(!isDev, rename('styles.min.css')))
        .pipe(gulpIf(isDev, sourcemaps.write('/')))
        .pipe(size({
            title: 'Размер',
            showFiles: true,
            showTotal: false
        }))
        .pipe(gulp.dest(dirs.buildPath + 'css'))
        .pipe(browserSync.stream());
});

// Компиляция сторонних css библиотек
gulp.task('css', function(callback) {
    const concat = require('gulp-concat');
    const sourcemaps = require('gulp-sourcemaps');
    const wait = require('gulp-wait');

    console.log('---------- Компиляция добавочных стилей');

    if (lists.css.length > 0) {
        return gulp.src(lists.css)
            .pipe(plumber({
                errorHandler: function(err) {
                    notify.onError({
                        title: 'CSS compilation error',
                        message: err.message
                    })(err);
                    this.emit('end');
                }
            }))
            .pipe(wait(100))
            .pipe(gulpIf(isDev, sourcemaps.init()))
            .pipe(debug({
                title: 'CSS styles:'
            }))
            .pipe(concat('plugins.css'))
            .pipe(postcss(postCssPlugins))
            .pipe(gulpIf(!isDev, cleanss()))
            .pipe(gulpIf(isDev, cssbeautify()))
            .pipe(gulpIf(!isDev, rename('plugins.min.css')))
            .pipe(gulpIf(isDev, sourcemaps.write('/')))
            .pipe(size({
                title: 'Размер',
                showFiles: true,
                showTotal: false
            }))
            .pipe(gulp.dest(dirs.buildPath + 'css'))
            .pipe(browserSync.stream());
    } else {
        console.log('---------- В сборке нет добавочных стилей');
        callback();
    }
});

// Сборка HTML
gulp.task('html', function () {
    const data = require('gulp-data');
    const nunjucks = require('gulp-nunjucks-render');
    const htmlbeautify = require('gulp-html-beautify');
    const prettify = require('gulp-prettify');

    console.log('---------- Сборка HTML');

    const getData = function () {
        let dataPath = dirs.htmlPath + 'global.json';

        return JSON.parse(fs.readFileSync(dataPath, 'utf8'))
    };

    const manageEnvironment = function(environment) {
        environment.addGlobal('NODE_ENV', process.env.NODE_ENV)
    };

    return gulp.src(dirs.htmlPath + '*.html')
        .pipe(plumber())
        .pipe(data(getData))
        .pipe(nunjucks({
            path: [__dirname + '/', dirs.htmlPath],
            manageEnv: manageEnvironment
        }))
        .pipe(embedSvg({
            root: dirs.SVG ,
            attrs: /class/ ,
            decodeEntities: true

        }))
        .pipe(prettify({
            indent_inner_html: false,
            preserve_newlines: true,
            unformatted: []
        }))
        .pipe(gulp.dest(dirs.buildPath));
});

// Конкатенация и углификация Javascript
gulp.task('js', function (callback) {
    const uglify = require('gulp-uglify');
    const concat = require('gulp-concat');

    if (lists.js.length > 0) {
        console.log('---------- Обработка JS');

        return gulp.src(lists.js)
            .pipe(plumber({
                errorHandler: function (err) {
                    notify.onError({
                        title: 'Javascript concat/uglify error',
                        message: err.message
                    })(err);
                    this.emit('end');
                }
            }))
            .pipe(concat('combined.min.js'))
            .pipe(gulpIf(!isDev, uglify().on('error', function (e) {
                console.log(e);
            })))
            .pipe(size({
                title: 'Размер',
                showFiles: true,
                showTotal: false
            }))
            .pipe(gulp.dest(dirs.buildPath + 'js'));
    } else {
        console.log('---------- Обработка JS: в сборке нет JS-файлов');
        callback();
    }
});

// Копирование JS
gulp.task('copy:js', function (callback) {
    if(projectConfig.copiedJs.length) {
        return gulp.src(projectConfig.copiedJs)
            .pipe(size({
                title: 'Размер',
                showFiles: true,
                showTotal: false
            }))
            .pipe(gulp.dest(dirs.buildPath + 'js'));
    } else {
        callback();
    }
});

//конвертация в webp и перенос в папку images
gulp.task('imagesWebp', function (callback) {
    return gulp.src(dirs.imgWeb + '/*.*')
        .pipe(webp(
            imageminWebp({quality: 50}),
        ))
        .pipe(gulp.dest(dirs.buildPath + '/images'))

});

gulp.task('imagesWebpClone', function (callback) {
    const imagemin = require('gulp-imagemin');
    const pngquant = require('imagemin-pngquant');

    return gulp.src(dirs.imgWeb + '/*.*')
        .pipe(newer(dirs.buildPath + '/images'))
        .pipe(gulpIf(!isDev, imagemin({
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngquant()]
        })))
        .pipe(size({
            title: 'Размер',
            showFiles: true,
            showTotal: false
        }))
        .pipe(gulp.dest(dirs.buildPath + '/images'))

});

// Сборка растрового спрайта (png)
let spritePngPath = dirs.spritePNG;
gulp.task('sprite:png', function (callback) {
    const spritesmith = require('gulp.spritesmith');
    const buffer = require('vinyl-buffer');
    const merge = require('merge-stream');
    const imagemin = require('gulp-imagemin');

    if(fileExist(spritePngPath) !== false) {
        del(dirs.imgGeneral + 'sprite.png');

        let fileName = 'sprite.png';
        let spriteData = gulp.src(spritePngPath + '*.png')
            .pipe(spritesmith({
                imgName: fileName,
                cssName: '_sprite.scss',
                padding: 5,
                imgPath: '/images/' + fileName
            }));
        let imgStream = spriteData.img
            .pipe(buffer())
            .pipe(imagemin([
                imagemin.optipng({ optimizationLevel: 5 }),
            ]))
            .pipe(gulp.dest(dirs.imgGeneral));
        let cssStream = spriteData.css
            .pipe(gulp.dest(dirs.cssPath + '/sass/base/'));
        return merge(imgStream, cssStream);
    } else {
        console.log('---------- Сборка PNG спрайта: ОТМЕНА');
        callback();
    }
});

//инлайн SVG
gulp.task('embedSvgs', () =>
    gulp.src(dirs.buildPath + '*.html')
        .pipe(embedSvg({
            root: dirs.SVG ,
            attrs: /class/ ,
            decodeEntities: true

        }))
        .pipe(gulp.dest(dirs.buildPath)));

// Копирование основных изображений
gulp.task('copy:img-general', function () {
    const imagemin = require('gulp-imagemin');
    const pngquant = require('imagemin-pngquant');

    console.log('---------- Копирование основных изображений');

    return gulp.src(dirs.imgGeneral + '**/*.{jpg,jpeg,gif,png,svg,ico}')
        .pipe(newer(dirs.buildPath + '/images'))
        .pipe(gulpIf(!isDev, imagemin({
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngquant()]
        })))
        .pipe(size({
            title: 'Размер',
            showFiles: true,
            showTotal: false
        }))
        .pipe(gulp.dest(dirs.buildPath + '/images'));
});

// Копирование временных изображений
gulp.task('copy:img-content', function () {
    const imagemin = require('gulp-imagemin');
    const pngquant = require('imagemin-pngquant');

    console.log('---------- Копирование временных изображений');

    return gulp.src(dirs.imgContent + '**/*.{jpg,jpeg,gif,png,svg,ico}')
        .pipe(newer(dirs.buildPath + '/temp'))
        .pipe(gulpIf(!isDev, imagemin({
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngquant()]
        })))
        .pipe(gulp.dest(dirs.buildPath + '/temp'));
});

// Копирование шрифтов
gulp.task('fonts', function () {
    console.log('---------- Копирование шрифтов');

    return gulp.src(dirs.fontsPath + '**/*.{ttf,woff,woff2,eot,svg}')
        .pipe(newer(dirs.buildPath + '/fonts'))
        .pipe(size({
            title: 'Размер',
            showFiles: true,
            showTotal: false
        }))
        .pipe(gulp.dest(dirs.buildPath + '/fonts'));
});

// Копирование статичных файлов
gulp.task('static', function () {
    console.log('---------- Копирование статичных файлов');

    return gulp.src([dirs.staticPath + '**/*.*', '!' + dirs.staticPath + '/readme.md'])
        .pipe(gulp.dest(dirs.buildPath + '/'));
});

// Генератор фавиконок
gulp.task('favicons', function(done) {
    realFavicon.generateFavicon({
        masterPicture: dirs.srcPath + '/favicon/favicon.png',
        dest: dirs.buildPath + '/favicon',
        iconsPath: '/favicon/',
        design: {
            ios: {
                pictureAspect: 'backgroundAndMargin',
                backgroundColor: '#ffffff',
                margin: '14%',
                assets: {
                    ios6AndPriorIcons: false,
                    ios7AndLaterIcons: false,
                    precomposedIcons: false,
                    declareOnlyDefaultIcon: true
                }
            },
            desktopBrowser: {},
            windows: {
                pictureAspect: 'noChange',
                backgroundColor: '#ffffff',
                onConflict: 'override',
                assets: {
                    windows80Ie10Tile: false,
                    windows10Ie11EdgeTiles: {
                        small: false,
                        medium: true,
                        big: false,
                        rectangle: false
                    }
                }
            },
            androidChrome: {
                pictureAspect: 'noChange',
                themeColor: '#ffffff',
                manifest: {
                    display: 'standalone',
                    orientation: 'notSet',
                    onConflict: 'override',
                    declared: true
                },
                assets: {
                    legacyIcon: false,
                    lowResolutionIcons: false
                }
            },
            safariPinnedTab: {
                pictureAspect: 'silhouette',
                themeColor: '#ffffff'
            }
        },
        settings: {
            scalingAlgorithm: 'Mitchell',
            errorOnImageTooSmall: false
        },
        markupFile: faviconData,
    }, function() {
        done();
        console.log('---------- Фавикон готов');
    });
});

//генерация подключения фавиконок в тело html
gulp.task('inject-favicon-markups', function() {
    return gulp.src([ dirs.htmlPath +'layouts/_favicon.html' ])
        .pipe(realFavicon.injectFaviconMarkups(JSON.parse(fs.readFileSync(faviconData)).favicon.html_code))
        .pipe(gulp.dest( dirs.htmlPath + 'layouts/'));
});

// Ручная проверка актуальности данных для favicon. Запускать перед стартом нового проекта.
gulp.task('check:favicons:update', function(done) {
    var currentVersion = JSON.parse(fs.readFileSync(faviconData)).version;
    realFavicon.checkForUpdates(currentVersion, function(err) {
        if (err) {
            throw err;
        }
    });
});


// Сборка всего
gulp.task('build', gulp.series(
    'clean',
    'sprite:png',
    'static',
    'favicons',
    'inject-favicon-markups',
    'sass',
    'css', 
    'js',
    'copy:js',
    'copy:img-general',
    'copy:img-content',
    'imagesWebp',
    'imagesWebpClone',
    'fonts',
    'html',
    'embedSvgs'
));

// Локальный сервер, слежение
gulp.task('serve', gulp.series('build', function () {

    browserSync.init({
        server: dirs.buildPath,
        startPath: '/',
        open: true
    });

    // Стили
    gulp.watch(dirs.cssPath + 'sass/**/*.scss', gulp.series('sass', reload));

    gulp.watch(dirs.cssPath + 'csslibs/**/*.css', gulp.series('css', reload));

    // HTML
    gulp.watch(dirs.htmlPath + '**/*.*', gulp.series('html', reload));

    // JS-файлы
    gulp.watch(lists.js, gulp.series('js', reload));

    // JS-файлы, которые нужно просто копировать
    if(projectConfig.copiedJs.length) {
        gulp.watch(projectConfig.copiedJs, gulp.series('copy:js', reload));
    }

    // PNG-изображения, попадающие в спрайт
    gulp.watch('*.png', {cwd: spritePngPath}, gulp.series('sprite:png', reload));

    // Основные изображения
    gulp.watch(dirs.imgGeneral + '**/*.{jpg,jpeg,gif,png,svg,ico}', gulp.series('copy:img-general', reload));

    //svg изображения
    gulp.watch(dirs.SVG + '**/*.svg', gulp.series('embedSvgs', reload));

    //изображения Webp
    gulp.watch(dirs.imgWeb + '**/*.{jpg,jpeg,png}', gulp.series('imagesWebp', reload));
    gulp.watch(dirs.imgWeb + '**/*.{jpg,jpeg,png}', gulp.series('imagesWebpClone', reload));

    // Временные изображения
    gulp.watch(dirs.imgContent + '**/*.{jpg,jpeg,gif,png,svg,ico}', gulp.series('copy:img-content', reload));

    // Шрифты
    gulp.watch(dirs.fontsPath + '**/*.{ttf,woff,woff2,eot,svg}', gulp.series('fonts', reload));

    // Статичные файлы
    gulp.watch(dirs.staticPath + '**/*.*', gulp.series('static', reload));

    //фавиконки
    gulp.watch(dirs.srcPath + 'favicon/*.*', gulp.series('favicons', reload));
}));

// Задача по умолчанию
gulp.task('default', gulp.series('serve'));

/**
 * Вернет объект с обрабатываемыми файлами и папками
 * @param  {object}
 * @return {object}
 **/
function getFilesList(config) {

    let res = {
        'css': [],
        'js': []
    };

    // Добавления
    res.css = res.css.concat(config.addCssLibs);
    res.js = config.addJsBefore.concat(res.js);
    res.js = res.js.concat(config.addJsAfter);

    return res;
}



/**
 * Проверка существования файла или папки
 * @param  {string} path      Путь до файла или папки]
 * @return {boolean}
 */
function fileExist(filepath) {
    let flag = true;
    try {
        fs.accessSync(filepath, fs.F_OK);
    } catch (e) {
        flag = false;
    }
    return flag;
}


// Перезагрузка браузера
function reload() {
    browserSync.reload();
}
